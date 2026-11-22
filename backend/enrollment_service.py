"""
Enrollment service for face recognition system
Handles multi-frame capture and master embedding creation
Stores embeddings in face_enrollments table (NOT profiles)
"""
import cv2
import numpy as np
import logging
from typing import Dict, List, Optional, Tuple
from embedding_service import FaceEmbeddingService
from database_service import DatabaseService

# Initialize logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class EnrollmentService:
    def __init__(
        self,
        embedding_service: Optional[FaceEmbeddingService] = None,
        database_service: Optional[DatabaseService] = None,
        min_valid_embeddings: int = 3,
        target_valid_embeddings: int = 5,
    ):
        self.embedding_service = embedding_service or FaceEmbeddingService(
            model_name="ArcFace",
            detector_backend="mtcnn"
        )
        self.database_service = database_service or DatabaseService()
        self.min_valid_embeddings = min_valid_embeddings
        self.target_valid_embeddings = max(target_valid_embeddings, min_valid_embeddings)

    def process_enrollment(self, profile_id: str, face_images: List[np.ndarray],
                          validate_liveness: bool = True) -> Tuple[bool, str, Optional[Dict]]:
        """
        Process face enrollment with multiple captures and create master embedding

        Args:
            profile_id: ID of the profile to enroll
            face_images: List of face images (minimum 3, ideal 5)
            validate_liveness: Whether to perform liveness check on each image

        Returns:
            Tuple of (success, message, details)
        """
        try:
            # Keep status aligned with the SQL CHECK constraint in the active schema.
            self.database_service.update_enrollment_status(profile_id, 'pending')

            embeddings_list = []
            processed_images_count = 0
            reject_reasons: Dict[str, int] = {}

            # Process each captured face image
            for i, image in enumerate(face_images):
                precheck = self.embedding_service.fast_face_precheck(image)
                if not precheck['is_valid']:
                    reason = str(precheck['reason'])
                    reject_reasons[reason] = reject_reasons.get(reason, 0) + 1
                    logger.warning(f"Image {i+1} failed quality validation: {reason}")
                    continue

                # Optional liveness validation for each image
                if validate_liveness:
                    is_live, liveness_confidence = self.embedding_service.detect_liveness_simple(image)
                    if not is_live:
                        logger.warning(f"Image {i+1} failed liveness check")
                        reject_reasons['liveness_failed'] = reject_reasons.get('liveness_failed', 0) + 1
                        continue

                # Extract embedding
                embedding = self.embedding_service.extract_single_embedding(image)
                if embedding:
                    embeddings_list.append(embedding)
                    processed_images_count += 1

                    if processed_images_count >= self.target_valid_embeddings:
                        logger.info(
                            "Early stop enrollment after %d valid embeddings for profile %s",
                            processed_images_count,
                            profile_id,
                        )
                        break
                else:
                    logger.warning(f"Failed to extract embedding from image {i+1}")
                    reject_reasons['embedding_failed'] = reject_reasons.get('embedding_failed', 0) + 1

            if processed_images_count < self.min_valid_embeddings:
                self.database_service.update_enrollment_status(profile_id, 'incomplete')
                return False, (
                    f'Insufficient valid face images for enrollment. '
                    f'Required: {self.min_valid_embeddings}, Got: {processed_images_count}'
                ), {
                    'processed_images': processed_images_count,
                    'required_images': self.min_valid_embeddings,
                    'target_images': self.target_valid_embeddings,
                    'submitted_images': len(face_images),
                    'rejected_reasons': reject_reasons,
                }

            # Calculate average embedding (master embedding)
            master_embedding = self.embedding_service.calculate_average_embedding(embeddings_list)
            if not master_embedding:
                self.database_service.update_enrollment_status(profile_id, 'incomplete')
                return False, 'Failed to calculate master embedding', {
                    'processed_images': processed_images_count,
                    'rejected_reasons': reject_reasons,
                }

            # Store the master embedding in face_enrollments table
            success = self.database_service.store_face_embedding(
                profile_id=profile_id,
                average_embedding=master_embedding
            )

            if success:
                # Update enrollment status to complete
                self.database_service.update_enrollment_status(profile_id, 'complete')
                logger.info(f"Successfully enrolled face for profile {profile_id}")
                return True, 'Face enrollment successful', {
                    'profile_id': profile_id,
                    'processed_images': processed_images_count,
                    'embedding_dimension': len(master_embedding),
                    'target_images': self.target_valid_embeddings,
                    'submitted_images': len(face_images),
                    'rejected_reasons': reject_reasons,
                }
            else:
                self.database_service.update_enrollment_status(profile_id, 'incomplete')
                return False, 'Failed to store embedding in database', {
                    'processed_images': processed_images_count,
                    'rejected_reasons': reject_reasons,
                }

        except Exception as e:
            logger.error(f"Enrollment error: {str(e)}")
            self.database_service.update_enrollment_status(profile_id, 'incomplete')
            return False, f'Enrollment failed due to error: {str(e)}', None

    def validate_enrollment_images(self, images: List[np.ndarray]) -> Tuple[bool, str, int]:
        """
        Validate a list of enrollment images for quality

        Args:
            images: List of face images to validate

        Returns:
            Tuple of (all_valid, message, valid_count)
        """
        valid_count = 0
        invalid_reasons = []

        for i, image in enumerate(images):
            precheck = self.embedding_service.fast_face_precheck(image)
            if precheck['is_valid']:
                valid_count += 1
            else:
                invalid_reasons.append(f"Image {i+1}: {precheck['reason']}")

        if valid_count >= self.min_valid_embeddings:
            return True, f"All good: {valid_count}/{len(images)} images are valid", valid_count
        else:
            return False, (
                f"Insufficient valid images: {valid_count}/{len(images)}. "
                f"Need at least {self.min_valid_embeddings}."
            ), valid_count

    def calculate_similarity_matrix(self, embeddings: List[List[float]]) -> Optional[np.ndarray]:
        """
        Calculate similarity matrix between all pairs of embeddings

        Args:
            embeddings: List of embeddings to compare

        Returns:
            Similarity matrix as numpy array
        """
        try:
            if len(embeddings) < 2:
                return None

            # Convert to numpy array
            embeddings_array = np.array(embeddings)
            n = len(embeddings)

            # Calculate cosine similarity matrix
            similarity_matrix = np.zeros((n, n))

            for i in range(n):
                for j in range(n):
                    if i == j:
                        similarity_matrix[i][j] = 1.0
                    else:
                        # Calculate cosine similarity
                        dot_product = np.dot(embeddings_array[i], embeddings_array[j])
                        norm_i = np.linalg.norm(embeddings_array[i])
                        norm_j = np.linalg.norm(embeddings_array[j])

                        if norm_i == 0 or norm_j == 0:
                            similarity_matrix[i][j] = 0.0
                        else:
                            similarity = dot_product / (norm_i * norm_j)
                            # Convert to 0-1 scale (cosine similarity is -1 to 1)
                            similarity_matrix[i][j] = (similarity + 1) / 2

            return similarity_matrix
        except Exception as e:
            logger.error(f"Error calculating similarity matrix: {e}")
            return None
