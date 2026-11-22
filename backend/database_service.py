"""
Production-scale database service for pgvector operations
Handles face matching, profile management, and attendance logging
Uses separate face_enrollments table for embeddings (NOT profiles table)
"""
import os
import logging
import json
from datetime import datetime, timezone
from time import perf_counter
from typing import Any, Dict, List, Optional, Tuple
from supabase import create_client, Client
import numpy as np

# Initialize logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class DatabaseService:
    def __init__(self):
        self.supabase_url = os.getenv('SUPABASE_URL')
        self.supabase_key = os.getenv('SUPABASE_SERVICE_ROLE_KEY')

        if not self.supabase_url or not self.supabase_key:
            raise ValueError("Missing Supabase environment variables")

        self.client: Client = create_client(self.supabase_url, self.supabase_key)

    def _normalize_single_row(self, data: Any) -> Optional[Dict[str, Any]]:
        """
        Normalize PostgREST response payload to a single dictionary row.
        """
        if data is None:
            return None
        if isinstance(data, list):
            return data[0] if data else None
        if isinstance(data, dict):
            return data
        return None

    def _record_timing(
        self,
        timings: Optional[Dict[str, Any]],
        key: str,
        elapsed_ms: float,
        additive: bool = False,
    ) -> None:
        if timings is None:
            return

        if additive:
            current_value = timings.get(key, 0.0)
            base_value = current_value if isinstance(current_value, (int, float)) else 0.0
            timings[key] = float(base_value) + elapsed_ms
            return

        timings[key] = elapsed_ms

    def _embedding_payload_size(self, embedding: Any) -> Optional[int]:
        if embedding is None:
            return None
        if isinstance(embedding, np.ndarray):
            return int(embedding.size)
        if isinstance(embedding, (list, tuple)):
            return len(embedding)
        if isinstance(embedding, str):
            return len(embedding)
        return None

    def _fetch_verification_context_via_rpc(
        self,
        user_id: str,
        timings: Optional[Dict[str, Any]] = None,
    ) -> Optional[Dict[str, Any]]:
        rpc_start = perf_counter()
        try:
            response = self.client.rpc(
                'get_active_enrollment_for_verification',
                {'user_uuid': user_id}
            ).execute()
        finally:
            self._record_timing(
                timings,
                'lookup_rpc_ms',
                (perf_counter() - rpc_start) * 1000,
                additive=True,
            )

        normalize_start = perf_counter()
        row = self._normalize_single_row(response.data)
        verification_context = None
        if row:
            verification_context = {
                'profile_id': row['profile_id'],
                'nim': row.get('nim'),
                'nama': row.get('nama'),
                'face_embedding': row['face_embedding'],
            }
        self._record_timing(
            timings,
            'response_normalize_ms',
            (perf_counter() - normalize_start) * 1000,
            additive=True,
        )

        return verification_context

    def _fetch_verification_context_via_join(
        self,
        user_id: str,
        timings: Optional[Dict[str, Any]] = None,
    ) -> Optional[Dict[str, Any]]:
        join_start = perf_counter()
        try:
            response = self.client.table('face_enrollments').select(
                'profile_id, face_embedding, profile:profiles!inner(nim, nama)'
            ).eq('profile_id', user_id).eq('is_active', True).limit(1).execute()
        finally:
            self._record_timing(
                timings,
                'lookup_fallback_join_ms',
                (perf_counter() - join_start) * 1000,
                additive=True,
            )

        normalize_start = perf_counter()
        row = self._normalize_single_row(response.data)
        verification_context = None
        if row:
            profile_payload = row.get('profile') or {}
            if isinstance(profile_payload, list):
                profile_payload = profile_payload[0] if profile_payload else {}

            verification_context = {
                'profile_id': row['profile_id'],
                'nim': profile_payload.get('nim'),
                'nama': profile_payload.get('nama'),
                'face_embedding': row['face_embedding'],
            }
        self._record_timing(
            timings,
            'response_normalize_ms',
            (perf_counter() - normalize_start) * 1000,
            additive=True,
        )

        return verification_context

    def store_face_embedding(self, profile_id: str, average_embedding: List[float]) -> bool:
        """
        Store the calculated master embedding in face_enrollments table

        Args:
            profile_id: ID of the profile
            average_embedding: Calculated average embedding (512-dim)

        Returns:
            True if successful
        """
        try:
            normalized_embedding = self._to_float32_embedding(average_embedding, "average_embedding")

            # Validate embedding dimensions
            if normalized_embedding.shape[0] != 512:
                logger.error(
                    "Invalid embedding dimensions for profile %s: expected 512, got %s",
                    profile_id,
                    normalized_embedding.shape[0],
                )
                return False

            # Deactivate existing enrollments for this profile (only one active at a time)
            self.client.table('face_enrollments').update({
                'is_active': False
            }).eq('profile_id', profile_id).eq('is_active', True).execute()

            # Insert new active enrollment
            insert_data = {
                'profile_id': profile_id,
                'face_embedding': normalized_embedding.tolist(),
                'is_active': True
            }

            response = self.client.table('face_enrollments').insert(insert_data).execute()

            if response.data:
                logger.info(f"Successfully stored enrollment for profile {profile_id}")
                return True
            else:
                logger.error(f"No rows inserted for profile {profile_id}")
                return False

        except Exception as e:
            logger.error(f"Error storing embedding for profile {profile_id}: {e}")
            return False

    def find_matching_profile_for_user(
        self,
        user_id: str,
        input_embedding: List[float],
        threshold: float = 0.75
    ) -> Tuple[Optional[Dict], Optional[str], Dict[str, Any], str]:
        """
        VERIFICATION MODE: Find matching enrollment ONLY for specific user_id.
        NOT identification (scanning entire database).

        Args:
            user_id: The user_id to verify (from Supabase Auth session)
            input_embedding: Embedding from captured face
            threshold: Minimum similarity threshold

        Returns:
            Tuple of (match_result_dict, error_message)
        """
        timings = {
            'db_fetch_ms': 0.0,
            'verify_lookup_ms': 0.0,
            'lookup_rpc_ms': 0.0,
            'lookup_fallback_join_ms': 0.0,
            'response_normalize_ms': 0.0,
            'stored_embedding_type': None,
            'stored_embedding_size': None,
            'input_embedding_normalize_ms': 0.0,
            'stored_embedding_normalize_ms': 0.0,
            'similarity_compute_ms': 0.0,
            'similarity_ms': 0.0,
        }
        lookup_strategy = 'rpc'

        try:
            lookup_start = perf_counter()
            try:
                verification_context = self._fetch_verification_context_via_rpc(
                    user_id,
                    timings=timings,
                )
            except Exception as rpc_error:
                lookup_strategy = 'join_fallback'
                logger.warning(
                    "Verification RPC lookup unavailable, falling back to join query for user %s: %s",
                    user_id,
                    rpc_error,
                )
                verification_context = self._fetch_verification_context_via_join(
                    user_id,
                    timings=timings,
                )

            timings['verify_lookup_ms'] = (perf_counter() - lookup_start) * 1000
            timings['db_fetch_ms'] = timings['verify_lookup_ms']

            if not verification_context:
                return None, "No face enrollment found for this user. Please enroll your face first.", timings, lookup_strategy

            stored_embedding = verification_context['face_embedding']
            timings['stored_embedding_type'] = type(stored_embedding).__name__
            timings['stored_embedding_size'] = self._embedding_payload_size(stored_embedding)
            logger.info(
                "Embedding payload types for user %s | input=%s | stored=%s | stored_size=%s",
                user_id,
                type(input_embedding).__name__,
                timings['stored_embedding_type'],
                timings['stored_embedding_size'],
            )
            if isinstance(stored_embedding, str):
                logger.info(
                    "Stored embedding string details for user %s | length=%d | preview=%s",
                    user_id,
                    len(stored_embedding),
                    stored_embedding[:80],
                )

            # Calculate cosine similarity using pgvector distance operator
            # 1 - cosine_distance = cosine_similarity
            similarity_start = perf_counter()
            similarity = self._calculate_similarity(
                input_embedding,
                stored_embedding,
                timings=timings,
            )
            timings['similarity_ms'] = (perf_counter() - similarity_start) * 1000

            if similarity >= threshold:
                if verification_context.get('nim') or verification_context.get('nama'):
                    return {
                        'profile_id': verification_context['profile_id'],
                        'nim': verification_context.get('nim'),
                        'nama': verification_context.get('nama'),
                        'similarity_score': similarity
                    }, None, timings, lookup_strategy

                return None, "Profile not found", timings, lookup_strategy
            else:
                return None, f"Face not recognized. Similarity: {similarity:.3f} < {threshold}", timings, lookup_strategy

        except Exception as e:
            logger.error(f"Error finding matching profile for user {user_id}: {e}")
            return None, f"Verification error: {str(e)}", timings, lookup_strategy

    def _calculate_similarity(
        self,
        embedding1: List[float],
        embedding2: List[float],
        timings: Optional[Dict[str, Any]] = None,
    ) -> float:
        """
        Calculate cosine similarity between two embeddings.
        ArcFace uses cosine distance, so similarity = 1 - distance.

        Args:
            embedding1: First embedding (512-dim)
            embedding2: Second embedding (512-dim)

        Returns:
            Similarity score (0.0 to 1.0)
        """
        try:
            input_normalize_start = perf_counter()
            emb1 = self._to_float32_embedding(embedding1, "input_embedding")
            self._record_timing(
                timings,
                'input_embedding_normalize_ms',
                (perf_counter() - input_normalize_start) * 1000,
            )

            stored_normalize_start = perf_counter()
            emb2 = self._to_float32_embedding(embedding2, "stored_embedding")
            self._record_timing(
                timings,
                'stored_embedding_normalize_ms',
                (perf_counter() - stored_normalize_start) * 1000,
            )

            compute_start = perf_counter()

            if emb1.shape != emb2.shape:
                raise ValueError(
                    f"Embedding shape mismatch: input={emb1.shape}, stored={emb2.shape}"
                )

            # Cosine similarity
            dot_product = float(np.dot(emb1, emb2))
            norm1 = float(np.linalg.norm(emb1))
            norm2 = float(np.linalg.norm(emb2))

            if norm1 == 0 or norm2 == 0:
                raise ValueError(
                    f"Zero-norm embedding detected: norm1={norm1}, norm2={norm2}"
                )

            similarity = dot_product / (norm1 * norm2)
            if not np.isfinite(similarity):
                raise ValueError(f"Non-finite similarity value: {similarity}")

            # ArcFace similarity is typically in range [0, 1]
            # Clip to ensure valid range
            similarity_clipped = float(max(0.0, min(1.0, similarity)))
            logger.info(
                "Similarity calculated successfully | shape=%s | raw=%.6f | clipped=%.6f",
                emb1.shape,
                similarity,
                similarity_clipped,
            )
            self._record_timing(
                timings,
                'similarity_compute_ms',
                (perf_counter() - compute_start) * 1000,
            )
            return similarity_clipped

        except Exception as e:
            logger.error(
                "Error calculating similarity: %s | input_type=%s | stored_type=%s",
                e,
                type(embedding1).__name__,
                type(embedding2).__name__,
                exc_info=True,
            )
            raise

    def _to_float32_embedding(self, embedding: Any, label: str) -> np.ndarray:
        """
        Normalize embedding payload to 1D np.ndarray float32.
        Accepts list/tuple/ndarray and string representations returned by PostgREST/pgvector.
        """
        if embedding is None:
            raise ValueError(f"{label} is None")

        arr: np.ndarray

        if isinstance(embedding, np.ndarray):
            arr = embedding
        elif isinstance(embedding, (list, tuple)):
            arr = np.asarray(embedding)
        elif isinstance(embedding, str):
            embedding_text = embedding.strip()
            if not embedding_text:
                raise ValueError(f"{label} is empty string")

            parsed = None
            try:
                parsed = json.loads(embedding_text)
            except json.JSONDecodeError:
                # Fallback for pgvector-like raw string: "[0.1,0.2,...]"
                cleaned = embedding_text.strip("[](){}")
                if not cleaned:
                    raise ValueError(f"{label} string has no numeric content")
                arr = np.fromstring(cleaned, sep=',')
                if arr.size == 0:
                    raise ValueError(
                        f"{label} string could not be parsed to numeric vector"
                    )
            else:
                if not isinstance(parsed, list):
                    raise TypeError(
                        f"{label} JSON parsed to {type(parsed).__name__}, expected list"
                    )
                arr = np.asarray(parsed)
        else:
            raise TypeError(
                f"{label} has unsupported type {type(embedding).__name__}"
            )

        try:
            arr = np.asarray(arr, dtype=np.float32).reshape(-1)
        except Exception as cast_error:
            raise TypeError(
                f"{label} cannot be converted to float32 array: {cast_error}"
            ) from cast_error

        if arr.size == 0:
            raise ValueError(f"{label} normalized to empty array")

        logger.info(
            "Normalized %s | dtype=%s | shape=%s",
            label,
            arr.dtype,
            arr.shape,
        )
        return arr

    def log_attendance_with_metadata(
        self,
        profile_id: str,
        attendance_type: str,
        captured_image_url: Optional[str] = None
    ) -> Tuple[Optional[str], Dict[str, Any]]:
        """
        Log attendance record to database

        Args:
            profile_id: ID of the matched profile
            attendance_type: 'masuk' or 'pulang'
            captured_image_url: URL of the captured face image

        Returns:
            Tuple of (attendance_id, metadata)
        """
        try:
            import uuid

            attendance_id = str(uuid.uuid4())
            event_timestamp = datetime.now(timezone.utc).isoformat()
            attendance_record = {
                'id': attendance_id,
                'profile_id': profile_id,
                'type': attendance_type,
                'captured_face_image_url': captured_image_url,
                'timestamp': event_timestamp,
            }

            insert_metadata: Dict[str, Any] = {
                'strategy': 'rpc',
                'response_has_data': False,
                'event_timestamp': event_timestamp,
            }

            try:
                rpc_response = self.client.rpc(
                    'insert_attendance_log',
                    {
                        'attendance_id': attendance_id,
                        'profile_uuid': profile_id,
                        'attendance_type': attendance_type,
                        'captured_image_url': captured_image_url,
                        'event_timestamp': event_timestamp,
                    }
                ).execute()
                insert_metadata['response_has_data'] = rpc_response.data is not None
                logger.info(
                    "Attendance logged via RPC for profile %s: %s",
                    profile_id,
                    attendance_type,
                )
                returned_id = rpc_response.data if rpc_response.data else attendance_id
                if isinstance(returned_id, list):
                    returned_id = returned_id[0] if returned_id else attendance_id
                return str(returned_id), insert_metadata
            except Exception as rpc_error:
                insert_metadata['strategy'] = 'insert_fallback'
                insert_metadata['rpc_error'] = str(rpc_error)
                logger.warning(
                    "Attendance RPC insert unavailable, falling back to direct insert for profile %s: %s",
                    profile_id,
                    rpc_error,
                )

                try:
                    response = self.client.table('attendance_logs').insert(attendance_record).execute()
                except Exception as insert_error:
                    if 'captured_face_image_url' not in str(insert_error):
                        raise

                    logger.warning(
                        "attendance_logs.captured_face_image_url is unavailable; retrying attendance insert without captured image URL: %s",
                        insert_error,
                    )
                    insert_metadata['direct_insert_error'] = str(insert_error)
                    insert_metadata['captured_image_url_omitted'] = True
                    legacy_attendance_record = {
                        key: value
                        for key, value in attendance_record.items()
                        if key != 'captured_face_image_url'
                    }
                    response = self.client.table('attendance_logs').insert(legacy_attendance_record).execute()

                insert_metadata['response_has_data'] = response.data is not None
                logger.info(
                    "Attendance logged via fallback insert for profile %s: %s",
                    profile_id,
                    attendance_type,
                )
                return attendance_id, insert_metadata

        except Exception as e:
            logger.error(f"Error logging attendance: {e}")
            return None, {
                'strategy': 'failed',
                'error': str(e),
            }

    def log_attendance(self, profile_id: str, attendance_type: str, captured_image_url: Optional[str] = None) -> Optional[str]:
        attendance_id, _ = self.log_attendance_with_metadata(
            profile_id=profile_id,
            attendance_type=attendance_type,
            captured_image_url=captured_image_url,
        )
        return attendance_id

    def log_performance(self, performance_payload: Dict[str, Any]) -> Optional[str]:
        """
        Persist performance metrics for register/checkin/checkout evaluation.
        """
        try:
            insert_data = {
                'profile_id': performance_payload.get('profile_id'),
                'action_type': performance_payload.get('action_type'),
                'result': performance_payload.get('result'),
                'total_ms': performance_payload.get('total_ms'),
                'warmup_ms': performance_payload.get('warmup_ms'),
                'capture_ms': performance_payload.get('capture_ms'),
                'verify_api_ms': performance_payload.get('verify_api_ms'),
                'enrollment_ms': performance_payload.get('enrollment_ms'),
                'similarity_score': performance_payload.get('similarity_score'),
                'sharpness_score': performance_payload.get('sharpness_score'),
                'valid_frames': performance_payload.get('valid_frames'),
                'failure_reason': performance_payload.get('failure_reason'),
                'lighting_condition': performance_payload.get('lighting_condition'),
                'brightness_score': performance_payload.get('brightness_score'),
                'lighting_category': performance_payload.get('lighting_category'),
                'face_box_ratio': performance_payload.get('face_box_ratio'),
                'distance_category': performance_payload.get('distance_category'),
                'experiment_note': performance_payload.get('experiment_note'),
                'metadata': performance_payload.get('metadata') or {},
            }

            try:
                response = self.client.table('performance_logs').insert(insert_data).execute()
            except Exception as insert_error:
                missing_column_hints = (
                    'brightness_score',
                    'lighting_category',
                    'face_box_ratio',
                    'distance_category',
                    'experiment_note',
                )
                if any(column in str(insert_error) for column in missing_column_hints):
                    logger.warning(
                        "performance_logs explicit columns not available yet; falling back to legacy insert: %s",
                        insert_error,
                    )
                    legacy_insert_data = {
                        key: value
                        for key, value in insert_data.items()
                        if key not in missing_column_hints
                    }
                    response = self.client.table('performance_logs').insert(legacy_insert_data).execute()
                else:
                    raise

            if response.data:
                log_id = response.data[0]['id']
                logger.info(
                    "Performance log stored | id=%s | profile_id=%s | action=%s | result=%s",
                    log_id,
                    insert_data.get('profile_id'),
                    insert_data.get('action_type'),
                    insert_data.get('result'),
                )
                return log_id

            logger.error("Failed to insert performance log. No rows returned.")
            return None
        except Exception as e:
            logger.error(f"Error logging performance metrics: {e}")
            return None

    def get_profile_by_id(self, profile_id: str) -> Optional[Dict]:
        """
        Get profile information by ID

        Args:
            profile_id: ID of the profile to retrieve

        Returns:
            Profile data or None if not found
        """
        try:
            response = self.client.table('profiles').select('*').eq('id', profile_id).execute()

            if response.data:
                return response.data[0]
            else:
                logger.info(f"No profile found with ID {profile_id}")
                return None

        except Exception as e:
            logger.error(f"Error retrieving profile {profile_id}: {e}")
            return None

    def update_enrollment_status(self, profile_id: str, status: str) -> bool:
        """
        Update enrollment status for a profile

        Args:
            profile_id: ID of the profile
            status: New status ('pending', 'complete', 'incomplete')

        Returns:
            True if successful
        """
        try:
            response = self.client.table('profiles').update({
                'enrollment_status': status
            }).eq('id', profile_id).execute()

            if response.data:
                logger.info(f"Updated enrollment status for {profile_id} to {status}")
                return True
            else:
                logger.warning(f"No rows updated for {profile_id}")
                return False

        except Exception as e:
            logger.error(f"Error updating enrollment status for {profile_id}: {e}")
            return False

    def get_active_enrollment(self, profile_id: str) -> Optional[Dict]:
        """
        Get the active face enrollment for a specific profile

        Args:
            profile_id: ID of the profile

        Returns:
            Enrollment data or None if not found
        """
        try:
            response = self.client.table('face_enrollments').select(
                'id, profile_id, is_active, created_at'
            ).eq('profile_id', profile_id).eq('is_active', True).execute()

            if response.data and len(response.data) > 0:
                return response.data[0]
            else:
                logger.info(f"No active enrollment found for profile {profile_id}")
                return None

        except Exception as e:
            logger.error(f"Error retrieving enrollment for profile {profile_id}: {e}")
            return None
