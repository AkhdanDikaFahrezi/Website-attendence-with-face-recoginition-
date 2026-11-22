# TensorFlow optimizations - must be set before importing tensorflow/deepface
import os
os.environ['TF_ENABLE_ONEDNN_OPTS'] = '0'
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '2'

from flask import Flask, request, jsonify
from flask_cors import CORS
import os
import json
import numpy as np
from datetime import datetime, timezone
import uuid
from dotenv import load_dotenv
import base64
import logging
from time import perf_counter

from io import BytesIO
from PIL import Image
import cv2

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Load environment variables
load_dotenv()

app = Flask(__name__)
CORS(app)

# Import services
from embedding_service import FaceEmbeddingService
from database_service import DatabaseService
from liveness_detection import ActiveLivenessDetection
from enrollment_service import EnrollmentService

# Initialize services
embedding_service = FaceEmbeddingService(model_name="ArcFace", detector_backend="mtcnn")
database_service = DatabaseService()
liveness_service = ActiveLivenessDetection()
enrollment_service = EnrollmentService(
    embedding_service=embedding_service,
    database_service=database_service,
)

SLOW_QUALITY_PRECHECK_MS = 2000
SLOW_EMBEDDING_MS = 5000

def build_verify_performance(stage_ms, precheck=None, liveness_confidence=None, extra=None):
    performance = {
        'stage_ms': {
            key: round(float(value), 2)
            for key, value in stage_ms.items()
        }
    }

    if precheck:
        performance['precheck'] = {
            'brightness': round(float(precheck.get('brightness', 0.0)), 2),
            'sharpness': round(float(precheck.get('sharpness', 0.0)), 2),
            'face_count': int(precheck.get('face_count', 0)),
            'face_box_ratio': (
                round(float(precheck.get('face_box_ratio')), 4)
                if precheck.get('face_box_ratio') is not None
                else None
            ),
            'distance_category': precheck.get('distance_category'),
            'detector': precheck.get('detector'),
            'reason': precheck.get('reason'),
            'is_valid': bool(precheck.get('is_valid')),
        }
        precheck_timings = precheck.get('timings_ms') or {}
        if isinstance(precheck_timings, dict):
            performance['precheck']['timings_ms'] = {
                key: round(float(value), 2)
                for key, value in precheck_timings.items()
            }

    if liveness_confidence is not None:
        performance['liveness_confidence'] = round(float(liveness_confidence), 4)

    if extra:
        for key, value in extra.items():
            if value is None:
                continue
            if isinstance(value, float):
                performance[key] = round(value, 2)
            else:
                performance[key] = value

    return performance

def utc_now_iso():
    return datetime.now(timezone.utc).isoformat()

def get_supabase_client():
    """
    Create and return a Supabase client
    This approach initializes the client only when needed, avoiding startup issues
    """
    # Import here to avoid potential conflicts at module level
    from supabase import create_client, ClientOptions

    supabase_url = os.getenv('SUPABASE_URL')
    supabase_key = os.getenv('SUPABASE_SERVICE_ROLE_KEY')

    # Create client with explicit options to avoid proxy issues
    try:
        # Create client with explicit options to avoid proxy-related issues
        options = ClientOptions()
        return create_client(supabase_url, supabase_key, options=options)
    except TypeError as e:
        if "proxy" in str(e):
            # If there's still a proxy issue, try creating the client without options
            return create_client(supabase_url, supabase_key)
        else:
            raise e

def base64_to_image(base64_string):
    """
    Convert a base64 string to an OpenCV image
    """
    try:
        # Remove data URL prefix if present
        if base64_string.startswith('data:image'):
            base64_string = base64_string.split(',')[1]

        # Decode base64 string
        image_data = base64.b64decode(base64_string)

        # Convert to numpy array
        np_array = np.frombuffer(image_data, np.uint8)

        # Decode image
        image = cv2.imdecode(np_array, cv2.IMREAD_COLOR)

        return image
    except Exception as e:
        logger.error(f"Error converting base64 to image: {e}")
        return None

# =====================================================
# FACE ENROLLMENT ENDPOINTS
# =====================================================

@app.route('/api/register/enroll', methods=['POST'])
def enroll_face():
    """
    Enroll face with multiple captures and create master embedding
    Expected JSON: {
        "profile_id": "uuid",
        "face_images": ["base64_img1", "base64_img2", ...],  # minimum 3, ideal 5
        "validate_liveness": true  # optional
    }
    """
    try:
        data = request.get_json() or {}
        profile_id = data.get('profile_id')
        face_images = data.get('face_images', [])
        validate_liveness = data.get('validate_liveness', True)

        if not profile_id or len(face_images) < 3:
            return jsonify({'error': 'Profile ID and at least 3 face images required'}), 400

        # Convert base64 strings to OpenCV images
        images = []
        for face_image_str in face_images:
            image = base64_to_image(face_image_str)
            if image is not None:
                images.append(image)

        if len(images) < 3:
            return jsonify({'error': 'At least 3 valid face images required'}), 400

        # Process enrollment using EnrollmentService
        success, message, details = enrollment_service.process_enrollment(
            profile_id, images, validate_liveness
        )

        if success:
            return jsonify({
                'message': message,
                'profile_id': profile_id,
                'processed_images': details.get('processed_images', 0),
                'embedding_dimension': details.get('embedding_dimension', 0)
            }), 201
        else:
            return jsonify({
                'error': message,
                'details': details
            }), 400

    except Exception as e:
        logger.error(f"Enrollment error: {str(e)}")
        return jsonify({'error': str(e)}), 500

# =====================================================
# FACE VERIFICATION ENDPOINTS (for attendance)
# =====================================================

@app.route('/api/verify/face', methods=['POST'])
def verify_face():
    """
    VERIFICATION MODE: Verify a face against the enrolled face of a SPECIFIC user.
    NOT identification (scanning entire database).
    
    Expected JSON: {
        "face_image": "base64_image",
        "user_id": "uuid",  # Supabase Auth user ID (from Next.js API route)
        "type": "masuk" or "pulang"  # optional, if provided will record attendance
    }
    """
    try:
        verify_start = perf_counter()
        request_body_parse_start = perf_counter()
        data = request.get_json() or {}
        flask_request_body_parse_ms = (perf_counter() - request_body_parse_start) * 1000
        face_image_str = data.get('face_image')
        user_id = data.get('user_id')
        attendance_type = data.get('type')
        payload_size_kb = (
            request.content_length / 1024
            if request.content_length is not None
            else None
        )
        face_image_payload_kb = (
            len(face_image_str) / 1024
            if isinstance(face_image_str, str)
            else None
        )
        stage_ms = {
            'decode_ms': 0.0,
            'quality_ms': 0.0,
            'liveness_ms': 0.0,
            'embedding_ms': 0.0,
            'similarity_ms': 0.0,
            'lookup_rpc_ms': 0.0,
            'lookup_fallback_join_ms': 0.0,
            'response_normalize_ms': 0.0,
            'input_embedding_normalize_ms': 0.0,
            'stored_embedding_normalize_ms': 0.0,
            'similarity_compute_ms': 0.0,
            'db_fetch_ms': 0.0,
            'verify_lookup_ms': 0.0,
            'attendance_insert_ms': 0.0,
        }
        precheck_result = None
        liveness_confidence = None
        lookup_strategy = None
        lookup_diagnostics = None
        attendance_insert_metadata = None

        def current_performance(extra=None):
            performance_extra = {
                'server_total_ms': (perf_counter() - verify_start) * 1000,
                'lookup_strategy': lookup_strategy,
                'payload_size_kb': payload_size_kb,
                'face_image_payload_kb': face_image_payload_kb,
                'flask_request_body_parse_ms': flask_request_body_parse_ms,
                'flask_decode_ms': stage_ms.get('decode_ms', 0.0),
            }
            if lookup_diagnostics:
                performance_extra['lookup_diagnostics'] = lookup_diagnostics
            if attendance_insert_metadata:
                performance_extra['attendance_insert'] = attendance_insert_metadata
            if extra:
                performance_extra.update(extra)

            return build_verify_performance(
                stage_ms,
                precheck_result,
                liveness_confidence,
                performance_extra,
            )

        def with_response_serialize_timing(payload):
            performance_payload = payload.get('performance') if isinstance(payload, dict) else None
            if isinstance(performance_payload, dict):
                serialize_start = perf_counter()
                json.dumps(payload, default=str)
                performance_payload['flask_response_serialize_ms'] = round(
                    (perf_counter() - serialize_start) * 1000,
                    2,
                )
            return payload

        if not face_image_str:
            return jsonify({'error': 'Face image is required'}), 400

        if not user_id:
            return jsonify({'error': 'user_id is required for verification mode'}), 400

        # Validate attendance type if provided
        if attendance_type and attendance_type not in ['masuk', 'pulang']:
            return jsonify({'error': 'Invalid attendance type. Must be "masuk" or "pulang"'}), 400

        # Convert base64 to image
        decode_start = perf_counter()
        image = base64_to_image(face_image_str)
        stage_ms['decode_ms'] = (perf_counter() - decode_start) * 1000
        if image is None:
            return jsonify({'error': 'Invalid image format'}), 400

        # Validate face quality with a cheap single-face precheck first
        quality_start = perf_counter()
        precheck_result = embedding_service.fast_face_precheck(image)
        stage_ms['quality_ms'] = (perf_counter() - quality_start) * 1000
        if stage_ms['quality_ms'] > SLOW_QUALITY_PRECHECK_MS:
            logger.warning(
                (
                    "Slow face quality precheck | quality_ms=%.2f | detector=%s | "
                    "timings_ms=%s | image_shape=%s | user_id=%s"
                ),
                stage_ms['quality_ms'],
                precheck_result.get('detector'),
                precheck_result.get('timings_ms'),
                getattr(image, 'shape', 'unknown'),
                user_id,
            )

        if not precheck_result['is_valid']:
            logger.warning(
                "Face validation FAILED: %s | Detector: %s | timings_ms=%s | Image shape: %s",
                precheck_result['reason'],
                precheck_result.get('detector'),
                precheck_result.get('timings_ms'),
                getattr(image, 'shape', 'unknown')
            )
            return jsonify(with_response_serialize_timing({
                'verified': False,
                'message': f"Face validation failed: {precheck_result['reason']}",
                'performance': current_performance(),
            })), 200

        distance_category = precheck_result.get('distance_category')
        if distance_category == 'Terlalu dekat':
            logger.info(
                "Verification blocked before liveness/embedding because face is too close | user_id=%s",
                user_id,
            )
            return jsonify(with_response_serialize_timing({
                'verified': False,
                'message': 'Wajah terlalu dekat ke kamera. Mohon mundur sedikit lalu coba lagi.',
                'performance': current_performance({
                    'precheck_blocked': 'face_too_close',
                }),
            })), 200

        # Perform liveness check
        liveness_start = perf_counter()
        is_live, liveness_confidence = embedding_service.detect_liveness_simple(image)
        stage_ms['liveness_ms'] = (perf_counter() - liveness_start) * 1000
        if not is_live:
            return jsonify(with_response_serialize_timing({
                'verified': False,
                'message': 'Liveness check failed - face not detected as live',
                'liveness_confidence': liveness_confidence,
                'performance': current_performance(),
            })), 200
        else:
            logger.info(f"Liveness check passed with confidence: {liveness_confidence}")

        # Extract embedding for the captured face
        embedding_start = perf_counter()
        input_embedding = embedding_service.extract_single_embedding(image)
        stage_ms['embedding_ms'] = (perf_counter() - embedding_start) * 1000
        if stage_ms['embedding_ms'] > SLOW_EMBEDDING_MS:
            logger.warning(
                (
                    "Slow face embedding extraction | embedding_ms=%.2f | "
                    "model=%s | detector_backend=%s | image_shape=%s | user_id=%s"
                ),
                stage_ms['embedding_ms'],
                embedding_service.model_name,
                embedding_service.detector_backend,
                getattr(image, 'shape', 'unknown'),
                user_id,
            )
        if not input_embedding:
            return jsonify(with_response_serialize_timing({
                'verified': False,
                'message': 'Could not extract face embedding from the captured image',
                'performance': current_performance(),
            })), 200

        # VERIFICATION MODE: Find matching enrollment ONLY for this specific user
        match_result, error_message, match_timings, lookup_strategy = database_service.find_matching_profile_for_user(
            user_id, input_embedding, threshold=0.75
        )
        stage_ms['db_fetch_ms'] = match_timings.get('db_fetch_ms', 0.0)
        stage_ms['verify_lookup_ms'] = match_timings.get('verify_lookup_ms', stage_ms['db_fetch_ms'])
        stage_ms['similarity_ms'] = match_timings.get('similarity_ms', 0.0)
        stage_ms['lookup_rpc_ms'] = match_timings.get('lookup_rpc_ms', 0.0)
        stage_ms['lookup_fallback_join_ms'] = match_timings.get('lookup_fallback_join_ms', 0.0)
        stage_ms['response_normalize_ms'] = match_timings.get('response_normalize_ms', 0.0)
        stage_ms['input_embedding_normalize_ms'] = match_timings.get('input_embedding_normalize_ms', 0.0)
        stage_ms['stored_embedding_normalize_ms'] = match_timings.get('stored_embedding_normalize_ms', 0.0)
        stage_ms['similarity_compute_ms'] = match_timings.get('similarity_compute_ms', 0.0)
        lookup_diagnostics = {
            key: (
                round(float(value), 2)
                if isinstance(value, (int, float))
                else value
            )
            for key, value in {
                'lookup_rpc_ms': match_timings.get('lookup_rpc_ms'),
                'lookup_fallback_join_ms': match_timings.get('lookup_fallback_join_ms'),
                'response_normalize_ms': match_timings.get('response_normalize_ms'),
                'stored_embedding_type': match_timings.get('stored_embedding_type'),
                'stored_embedding_size': match_timings.get('stored_embedding_size'),
                'input_embedding_normalize_ms': match_timings.get('input_embedding_normalize_ms'),
                'stored_embedding_normalize_ms': match_timings.get('stored_embedding_normalize_ms'),
                'similarity_compute_ms': match_timings.get('similarity_compute_ms'),
            }.items()
            if value is not None
        }

        if match_result:
            # Match found - return profile information
            result = {
                'verified': True,
                'profile': {
                    'id': match_result['profile_id'],
                    'nim': match_result['nim'],
                    'nama': match_result['nama'],
                    'similarity_score': match_result['similarity_score']
                },
                'performance': current_performance(),
            }

            # Log attendance if type is specified
            if attendance_type:
                attendance_insert_start = perf_counter()
                attendance_id, attendance_insert_metadata = database_service.log_attendance_with_metadata(
                    profile_id=match_result['profile_id'],
                    attendance_type=attendance_type
                )
                stage_ms['attendance_insert_ms'] = (perf_counter() - attendance_insert_start) * 1000
                if attendance_insert_metadata is None:
                    attendance_insert_metadata = {'strategy': 'unknown'}
                attendance_insert_metadata['succeeded'] = bool(attendance_id)
                result['performance'] = current_performance()

                if attendance_id:
                    result['attendance'] = {
                        'id': attendance_id,
                        'type': attendance_type,
                        'timestamp': (
                            attendance_insert_metadata.get('event_timestamp')
                            if isinstance(attendance_insert_metadata, dict)
                            else utc_now_iso()
                        ),
                        'message': 'Attendance recorded successfully'
                    }

            return jsonify(with_response_serialize_timing(result)), 200
        else:
            return jsonify(with_response_serialize_timing({
                'verified': False,
                'message': error_message or 'Face not recognized or similarity below threshold',
                'similarity_score': 0.0,
                'performance': current_performance(),
            })), 200

    except Exception as e:
        logger.error(f"Verification error: {str(e)}")
        return jsonify({'error': str(e)}), 500

# =====================================================
# LIVENESS DETECTION ENDPOINT
# =====================================================

@app.route('/api/verify/liveness-challenge', methods=['POST'])
def perform_liveness_challenge():
    """
    Perform active liveness detection challenge
    Expected JSON: {
        "frames_sequence": ["base64_img1", "base64_img2", ...]  # 5-10 sequential frames
    }
    """
    try:
        data = request.get_json()
        frames_sequence_b64 = data.get('frames_sequence', [])

        if len(frames_sequence_b64) < 3:
            return jsonify({'error': 'At least 3 frames required for liveness challenge'}), 400

        # Convert base64 frames to images
        frames = []
        for frame_str in frames_sequence_b64:
            image = base64_to_image(frame_str)
            if image is not None:
                frames.append(image)

        if len(frames) < 3:
            return jsonify({'error': 'Insufficient valid frames for liveness challenge'}), 400

        # Perform active liveness detection
        is_live, challenge_results = liveness_service.perform_active_liveness(frames)

        return jsonify({
            'is_live': is_live,
            'challenge_results': challenge_results,
            'overall_confidence': sum(cr['confidence'] for cr in challenge_results) / len(challenge_results) if challenge_results else 0.0
        }), 200

    except Exception as e:
        logger.error(f"Liveness challenge error: {str(e)}")
        return jsonify({'error': str(e)}), 500

# =====================================================
# ATTENDANCE ENDPOINTS
# =====================================================

@app.route('/api/attendance/<profile_id>', methods=['GET'])
def get_attendance(profile_id):
    """
    Get attendance history for a student
    """
    try:
        # Validate UUID format
        import re
        uuid_pattern = re.compile(r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', re.IGNORECASE)
        if not uuid_pattern.match(profile_id):
            return jsonify({'error': f'Invalid profile ID format: {profile_id}. Expected UUID format.'}), 400

        # Get Supabase client
        supabase = get_supabase_client()

        # Get attendance records for the profile using Supabase
        response = supabase.table('attendance_logs').select('*').eq('profile_id', profile_id).order('timestamp', desc=True).execute()
        attendance_records = response.data

        return jsonify({
            'attendance': attendance_records
        }), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/attendance', methods=['POST'])
def record_attendance():
    """
    Record attendance for a student
    Expected JSON: {
        "profile_id": "student_profile_id",
        "type": "masuk" or "pulang"
    }
    """
    try:
        # Get Supabase client
        supabase = get_supabase_client()

        data = request.get_json()
        profile_id = data.get('profile_id')
        attendance_type = data.get('type')

        if not all([profile_id, attendance_type]) or attendance_type not in ['masuk', 'pulang']:
            return jsonify({'error': 'Profile ID and valid attendance type (masuk/pulang) are required'}), 400

        # Verify that the profile exists
        profile_response = supabase.table('profiles').select('id').eq('id', profile_id).execute()
        if not profile_response.data:
            return jsonify({'error': 'Profile not found'}), 404

        # Insert attendance record using Supabase
        attendance_id = str(uuid.uuid4())
        new_attendance = {
            'id': attendance_id,
            'profile_id': profile_id,
            'type': attendance_type,
            'timestamp': utc_now_iso()
        }

        response = supabase.table('attendance_logs').insert(new_attendance).execute()

        return jsonify({
            'message': 'Attendance recorded successfully',
            'attendance_id': attendance_id
        }), 201

    except Exception as e:
        return jsonify({'error': str(e)}), 500


# PERFORMANCE LOGGING ENDPOINTS


@app.route('/api/performance', methods=['POST'])
def log_performance():
    """
    Store performance metrics for research/evaluation.
    Expected JSON:
    {
        "profile_id": "uuid or null",
        "action_type": "register|checkin|checkout",
        "result": "success|failed",
        "total_ms": number,
        "warmup_ms": number|null,
        "capture_ms": number|null,
        "verify_api_ms": number|null,
        "enrollment_ms": number|null,
        "similarity_score": number|null,
        "sharpness_score": number|null,
        "valid_frames": number|null,
        "lighting_condition": number|null,
        "brightness_score": number|null,
        "lighting_category": "Gelap|Cukup|Terang|Sangat terang"|null,
        "face_box_ratio": number|null,
        "distance_category": "Terlalu dekat|Ideal|Terlalu jauh"|null,
        "experiment_note": "text|null",
        "failure_reason": "text|null",
        "metadata": { ... }
    }
    """
    try:
        data = request.get_json() or {}

        action_type = data.get('action_type')
        if action_type not in ['register', 'checkin', 'checkout']:
            return jsonify({'error': 'action_type harus register, checkin, atau checkout'}), 400

        result = data.get('result', 'success')
        if result not in ['success', 'failed']:
            return jsonify({'error': 'result harus success atau failed'}), 400

        def parse_float(field_name, required=False):
            value = data.get(field_name)
            if value is None:
                if required:
                    raise ValueError(f'{field_name} wajib diisi')
                return None
            return parse_float_value(value, field_name)

        def parse_float_value(value, field_name):
            try:
                parsed = float(value)
            except (TypeError, ValueError):
                raise ValueError(f'{field_name} harus berupa angka')
            if parsed < 0:
                raise ValueError(f'{field_name} tidak boleh negatif')
            return parsed

        def parse_int(field_name):
            value = data.get(field_name)
            if value is None:
                return None
            try:
                parsed = int(value)
            except (TypeError, ValueError):
                raise ValueError(f'{field_name} harus berupa integer')
            if parsed < 0:
                raise ValueError(f'{field_name} tidak boleh negatif')
            return parsed

        def parse_category(value, field_name, allowed_values):
            if value is None:
                return None
            if not isinstance(value, str):
                raise ValueError(f'{field_name} harus berupa teks')

            normalized = value.strip()
            if not normalized:
                return None

            if normalized not in allowed_values:
                raise ValueError(
                    f"{field_name} tidak valid. Pilihan: {', '.join(sorted(allowed_values))}"
                )

            return normalized

        def parse_optional_note(value):
            if value is None:
                return None

            normalized = str(value).strip()
            if not normalized:
                return None

            if len(normalized) > 1000:
                raise ValueError('experiment_note maksimal 1000 karakter')

            return normalized

        total_ms = parse_float('total_ms', required=True)
        warmup_ms = parse_float('warmup_ms')
        capture_ms = parse_float('capture_ms')
        verify_api_ms = parse_float('verify_api_ms')
        enrollment_ms = parse_float('enrollment_ms')
        similarity_score = parse_float('similarity_score')
        sharpness_score = parse_float('sharpness_score')
        lighting_condition = parse_float('lighting_condition')
        valid_frames = parse_int('valid_frames')

        metadata = data.get('metadata')
        if metadata is None:
            metadata = {}
        elif not isinstance(metadata, dict):
            metadata = {'raw_metadata': metadata}

        brightness_source = data.get('brightness_score', metadata.get('brightness_score'))
        face_box_ratio_source = data.get('face_box_ratio', metadata.get('face_box_ratio'))
        lighting_category_source = data.get('lighting_category', metadata.get('lighting_category'))
        distance_category_source = data.get('distance_category', metadata.get('distance_category'))
        experiment_note_source = data.get('experiment_note', metadata.get('experiment_note'))

        brightness_score = (
            parse_float_value(brightness_source, 'brightness_score')
            if brightness_source is not None
            else None
        )
        face_box_ratio = (
            parse_float_value(face_box_ratio_source, 'face_box_ratio')
            if face_box_ratio_source is not None
            else None
        )
        if face_box_ratio is not None and face_box_ratio > 1:
            raise ValueError('face_box_ratio harus bernilai antara 0 dan 1')

        lighting_category = parse_category(
            lighting_category_source,
            'lighting_category',
            {'Gelap', 'Cukup', 'Terang', 'Sangat terang'},
        )
        distance_category = parse_category(
            distance_category_source,
            'distance_category',
            {'Terlalu dekat', 'Ideal', 'Terlalu jauh'},
        )
        experiment_note = parse_optional_note(experiment_note_source)

        payload = {
            'profile_id': data.get('profile_id'),
            'action_type': action_type,
            'result': result,
            'total_ms': total_ms,
            'warmup_ms': warmup_ms,
            'capture_ms': capture_ms,
            'verify_api_ms': verify_api_ms,
            'enrollment_ms': enrollment_ms,
            'similarity_score': similarity_score,
            'sharpness_score': sharpness_score,
            'valid_frames': valid_frames,
            'lighting_condition': lighting_condition,
            'brightness_score': brightness_score,
            'lighting_category': lighting_category,
            'face_box_ratio': face_box_ratio,
            'distance_category': distance_category,
            'experiment_note': experiment_note,
            'failure_reason': data.get('failure_reason'),
            'metadata': metadata,
        }

        log_id = database_service.log_performance(payload)
        if not log_id:
            return jsonify({'error': 'Gagal menyimpan performance log'}), 500

        return jsonify({'message': 'Performance log tersimpan', 'id': log_id}), 201

    except ValueError as validation_error:
        return jsonify({'error': str(validation_error)}), 400
    except Exception as e:
        logger.error(f"Performance log error: {str(e)}")
        return jsonify({'error': str(e)}), 500


# LEAVE REQUEST ENDPOINTS


@app.route('/api/leave', methods=['POST'])
def submit_leave_request():
    """
    Submit a leave request
    Expected JSON: {
        "profile_id": "student_profile_id",
        "type": "izin" or "sakit",
        "reason": "reason for leave",
        "date": "YYYY-MM-DD"
    }
    """
    try:
        # Get Supabase client
        supabase = get_supabase_client()

        data = request.get_json()
        profile_id = data.get('profile_id')
        leave_type = data.get('type')
        reason = data.get('reason')
        date = data.get('date')

        if not all([profile_id, leave_type, reason, date]) or leave_type not in ['izin', 'sakit']:
            return jsonify({'error': 'Profile ID, valid leave type (izin/sakit), reason, and date are required'}), 400

        # Verify that the profile exists
        profile_response = supabase.table('profiles').select('id').eq('id', profile_id).execute()
        if not profile_response.data:
            return jsonify({'error': 'Profile not found'}), 404

        # Parse the date string to ensure it's valid
        try:
            parsed_date = datetime.strptime(date, '%Y-%m-%d').date()
        except ValueError:
            return jsonify({'error': 'Invalid date format. Use YYYY-MM-DD.'}), 400

        # Insert leave request record using Supabase
        request_id = str(uuid.uuid4())
        new_request = {
            'id': request_id,
            'profile_id': profile_id,
            'type': leave_type,
            'reason': reason,
            'date': parsed_date.isoformat()
        }

        response = supabase.table('leave_requests').insert(new_request).execute()

        return jsonify({
            'message': 'Leave request submitted successfully',
            'request_id': request_id
        }), 201

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/leave/<profile_id>', methods=['GET'])
def get_leave_requests(profile_id):
    """
    Get all leave requests for a student
    """
    try:
        # Get Supabase client
        supabase = get_supabase_client()

        # Verify that the profile exists
        profile_response = supabase.table('profiles').select('id').eq('id', profile_id).execute()
        if not profile_response.data:
            return jsonify({'error': 'Profile not found'}), 404

        # Get leave requests for the profile using Supabase
        response = supabase.table('leave_requests').select('*').eq('profile_id', profile_id).order('created_at', desc=True).execute()
        leave_requests = response.data

        return jsonify({
            'leave_requests': leave_requests
        }), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/leave/<request_id>', methods=['PUT'])
def update_leave_request(request_id):
    """
    Update a leave request
    Expected JSON: {
        "type": "izin" or "sakit" (optional),
        "reason": "reason for leave" (optional),
        "date": "YYYY-MM-DD" (optional),
        "status": "pending/approved/rejected" (optional)
    }
    """
    try:
        # Get Supabase client
        supabase = get_supabase_client()

        data = request.get_json()

        # Verify that the leave request exists
        request_response = supabase.table('leave_requests').select('id').eq('id', request_id).execute()
        if not request_response.data:
            return jsonify({'error': 'Leave request not found'}), 404

        # Prepare update data
        update_data = {}

        if 'type' in data:
            leave_type = data.get('type')
            if leave_type not in ['izin', 'sakit']:
                return jsonify({'error': 'Invalid leave type. Must be "izin" or "sakit"'}), 400
            update_data['type'] = leave_type

        if 'reason' in data:
            update_data['reason'] = data.get('reason')

        if 'date' in data:
            date = data.get('date')
            try:
                parsed_date = datetime.strptime(date, '%Y-%m-%d').date()
                update_data['date'] = parsed_date.isoformat()
            except ValueError:
                return jsonify({'error': 'Invalid date format. Use YYYY-MM-DD.'}), 400

        if 'status' in data:
            status = data.get('status')
            if status not in ['pending', 'approved', 'rejected']:
                return jsonify({'error': 'Invalid status. Must be "pending", "approved", or "rejected"'}), 400
            update_data['status'] = status

        if 'reject_reason' in data:
            update_data['reject_reason'] = data.get('reject_reason')

        # Approval update must be performed by admin reviewer
        is_approval_update = ('status' in data) or ('reject_reason' in data)
        if is_approval_update:
            reviewer_id = data.get('reviewer_id')
            if not reviewer_id:
                return jsonify({'error': 'reviewer_id is required for approval update'}), 400

            reviewer_response = supabase.table('profiles').select('id, role').eq('id', reviewer_id).execute()
            if not reviewer_response.data:
                return jsonify({'error': 'Reviewer profile not found'}), 404

            reviewer_role = reviewer_response.data[0].get('role') or 'student'
            if reviewer_role not in ['admin', 'dosen', 'lecturer']:
                return jsonify({'error': 'Only admin can approve/reject leave requests'}), 403

            update_data['reviewed_by'] = reviewer_id
            update_data['reviewed_at'] = datetime.now().isoformat()

            # Reset reject_reason when request is approved
            if data.get('status') == 'approved':
                update_data['reject_reason'] = None

        # Add updated_at timestamp
        update_data['updated_at'] = datetime.now().isoformat()

        # Update the leave request using Supabase
        response = supabase.table('leave_requests').update(update_data).eq('id', request_id).execute()

        return jsonify({
            'message': 'Leave request updated successfully',
            'request': response.data[0] if response.data else None
        }), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/leave/pending', methods=['GET'])
def get_pending_leave_requests():
    """
    Get all pending leave requests
    """
    try:
        # Get Supabase client
        supabase = get_supabase_client()

        # Get all pending leave requests with associated profile information
        response = supabase.table('leave_requests') \
            .select('*, profiles:profiles!leave_requests_profile_id_fkey(nim, nama)') \
            .eq('status', 'pending') \
            .order('created_at', desc=True) \
            .execute()

        leave_requests = response.data

        # Format the response to include profile details
        formatted_requests = []
        for request in leave_requests:
            formatted_request = {
                'id': request['id'],
                'profile_id': request['profile_id'],
                'type': request['type'],
                'reason': request['reason'],
                'date': request['date'],
                'status': request['status'],
                'created_at': request['created_at'],
                'updated_at': request.get('updated_at', request['created_at']),
                'reject_reason': request.get('reject_reason')
            }

            # Add profile information if available
            if request.get('profiles'):
                profile = request['profiles']
                formatted_request['name'] = profile.get('nama')
                formatted_request['nim'] = profile.get('nim')

            formatted_requests.append(formatted_request)

        return jsonify({
            'leave_requests': formatted_requests
        }), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500

# =====================================================
# PROFILE ENDPOINTS
# =====================================================

@app.route('/api/profile/by-user-id', methods=['POST'])
def get_profile_by_user_id():
    """
    Get a profile by Supabase user ID
    Expected JSON: {
        "user_id": "user_id"
    }
    """
    try:
        # Get Supabase client
        supabase = get_supabase_client()

        data = request.get_json()
        user_id = data.get('user_id')

        if not user_id:
            return jsonify({'error': 'User ID is required'}), 400

        # Get profile by user ID
        response = supabase.table('profiles').select('id, nim, nama, kelas, semester, email, created_at').eq('id', user_id).execute()
        profiles = response.data

        if not profiles:
            return jsonify({'error': 'Profile not found for the given user ID'}), 404

        # Return the first profile found (there should only be one)
        profile = profiles[0]

        # Add role information based on email or other criteria
        email = profile.get('email', '')
        if '@admin' in email or '@dosen' in email:
            profile['role'] = 'admin'  # Could be 'admin' or 'dosen'
        else:
            profile['role'] = 'mahasiswa'

        # Map schema column names to expected response names
        formatted_profile = {
            'id': profile.get('id'),
            'nim': profile.get('nim'),
            'name': profile.get('nama'),
            'class_schedule': profile.get('kelas'),
            'semester': profile.get('semester'),
            'email': profile.get('email'),
            'created_at': profile.get('created_at'),
            'role': profile.get('role')
        }

        return jsonify({'profile': formatted_profile}), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/admin/students', methods=['GET'])
def get_all_students():
    """
    Get all registered students
    """
    try:
        # Get Supabase client
        supabase = get_supabase_client()

        # Get all student profiles
        response = supabase.table('profiles').select('*').order('created_at', desc=True).execute()
        students = response.data

        # Format the response
        formatted_students = []
        for student in students:
            formatted_student = {
                'id': student['id'],
                'nim': student.get('nim'),
                'name': student.get('nama'),
                'class_schedule': student.get('kelas', 'N/A'),
                'semester': student.get('semester', 'N/A'),
                'email': student.get('email', 'N/A'),
                'created_at': student['created_at']
            }
            formatted_students.append(formatted_student)

        return jsonify({
            'students': formatted_students
        }), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500

# =====================================================
# ROOT & HEALTH ENDPOINTS
# =====================================================

@app.route('/')
def index():
    """
    Root endpoint to display available API endpoints
    """
    return jsonify({
        'message': 'Face Recognition Attendance System API',
        'version': '2.0',
        'architecture': 'Verification mode (NOT identification)',
        'endpoints': {
            'health': {'GET': '/api/health'},
            'enroll': {'POST': '/api/register/enroll'},
            'verify': {'POST': '/api/verify/face'},
            'liveness': {'POST': '/api/verify/liveness-challenge'},
            'attendance': {
                'get': '/api/attendance/<profile_id>',
                'post': '/api/attendance'
            },
            'performance': {'post': '/api/performance'},
            'leave': {
                'post': '/api/leave',
                'get': '/api/leave/<profile_id>',
                'get_pending': '/api/leave/pending',
                'put': '/api/leave/<request_id>'
            },
            'profile': {'POST': '/api/profile/by-user-id'},
            'admin': {'GET': '/api/admin/students'}
        }
    }), 200

@app.route('/api/health', methods=['GET'])
def health_check():
    """
    Health check endpoint
    """
    return jsonify({'status': 'healthy'}), 200


if __name__ == '__main__':
    print("\n" + "="*60)
    print("FLASK SERVER RUNNING SUCCESSFULLY")
    print("Connection successfully established on:")
    print("http://127.0.0.1:5001")
    print("="*60 + "\n")
    app.run(debug=True, host='0.0.0.0', port=5001)
