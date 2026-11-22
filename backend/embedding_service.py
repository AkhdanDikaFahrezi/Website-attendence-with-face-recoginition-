"""
Production-scale face embedding service using DeepFace
Handles embedding extraction, liveness detection, and average embedding calculation
"""
import cv2
import numpy as np
import logging
from time import perf_counter
from typing import Any, Dict, List, Optional, Tuple
from deepface import DeepFace
import mediapipe as mp

# Initialize logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class FaceEmbeddingService:
    PRECHECK_MAX_DIM = 384
    EMBEDDING_MAX_DIM = 512

    def __init__(self, model_name: str = "ArcFace", detector_backend: str = "opencv"):
        """
        Initialize with pre-trained DeepFace model

        Args:
            model_name: Pre-trained model ('Facenet', 'VGG-Face', 'ArcFace', etc.)
            detector_backend: Face detection backend ('opencv', 'mtcnn', 'retinaface', etc.)
        """
        self.model_name = model_name
        self.detector_backend = detector_backend
        self.mp_face_mesh = mp.solutions.face_mesh
        self.face_mesh = self.mp_face_mesh.FaceMesh(
            static_image_mode=True,
            max_num_faces=1,
            min_detection_confidence=0.5,
        )
        self.face_cascade = cv2.CascadeClassifier(
            cv2.data.haarcascades + 'haarcascade_frontalface_default.xml'
        )
        self.embedding_model = None

        if self.face_cascade.empty():
            logger.warning("Failed to initialize Haar cascade face detector")

        self._preload_models()

    def _preload_models(self) -> None:
        """
        Preload the recognition model once at startup so first-request latency is lower.
        """
        try:
            self.embedding_model = DeepFace.build_model(self.model_name)
            logger.info("Preloaded DeepFace model: %s", self.model_name)
        except Exception as e:
            logger.warning("Model preload failed for %s: %s", self.model_name, e)

    def _resize_with_max_dim(self, image: np.ndarray, max_dim: int) -> np.ndarray:
        """
        Resize image while preserving aspect ratio, only when larger than max_dim.
        """
        if image is None or not hasattr(image, 'shape'):
            return image

        height, width = image.shape[:2]
        largest_dim = max(height, width)
        if largest_dim <= max_dim:
            return image

        scale = max_dim / float(largest_dim)
        new_width = max(1, int(width * scale))
        new_height = max(1, int(height * scale))
        resized = cv2.resize(image, (new_width, new_height), interpolation=cv2.INTER_AREA)
        logger.debug(
            "Resized frame for processing | from=%sx%s | to=%sx%s | max_dim=%s",
            width,
            height,
            new_width,
            new_height,
            max_dim,
        )
        return resized

    def _to_rgb(self, image: np.ndarray) -> np.ndarray:
        if len(image.shape) == 3:
            if image.shape[2] == 3:
                return cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
            if image.shape[2] == 4:
                return cv2.cvtColor(image, cv2.COLOR_BGRA2RGB)

        return cv2.cvtColor(image, cv2.COLOR_GRAY2RGB)

    def _detect_face_box_with_mediapipe(
        self,
        image: np.ndarray,
    ) -> Optional[Tuple[int, int, int, int]]:
        """
        Fallback face box detector for slightly angled enrollment captures.
        Haar Cascade is fast but rejects many non-perfect frontal photos.
        """
        try:
            rgb_image = self._to_rgb(image)
            results = self.face_mesh.process(rgb_image)

            if not results.multi_face_landmarks:
                return None

            height, width = image.shape[:2]
            landmarks = results.multi_face_landmarks[0].landmark
            xs = [min(max(point.x, 0.0), 1.0) for point in landmarks]
            ys = [min(max(point.y, 0.0), 1.0) for point in landmarks]

            x_min = int(min(xs) * width)
            y_min = int(min(ys) * height)
            x_max = int(max(xs) * width)
            y_max = int(max(ys) * height)
            box_width = max(0, x_max - x_min)
            box_height = max(0, y_max - y_min)

            if box_width < 30 or box_height < 30:
                return None

            return (x_min, y_min, box_width, box_height)
        except Exception as e:
            logger.debug("MediaPipe face fallback failed: %s", e)
            return None

    def fast_face_precheck(self, image: np.ndarray) -> Dict[str, Any]:
        """
        Run cheap quality checks before expensive liveness / embedding steps.
        """
        result: Dict[str, Any] = {
            'is_valid': False,
            'reason': 'Unknown validation state',
            'brightness': 0.0,
            'sharpness': 0.0,
            'face_count': 0,
            'face_box_ratio': None,
            'distance_category': None,
            'detector': 'none',
            'timings_ms': {
                'resize_ms': 0.0,
                'gray_ms': 0.0,
                'laplacian_ms': 0.0,
                'haar_ms': 0.0,
                'mediapipe_fallback_ms': 0.0,
            },
        }

        try:
            if image is None or not hasattr(image, 'shape'):
                result['reason'] = 'Invalid image'
                return result

            if image.shape[0] < 64 or image.shape[1] < 64:
                result['reason'] = 'Image too small'
                return result

            resize_start = perf_counter()
            precheck_image = self._resize_with_max_dim(image, self.PRECHECK_MAX_DIM)
            result['timings_ms']['resize_ms'] = (perf_counter() - resize_start) * 1000

            gray_start = perf_counter()
            gray = (
                cv2.cvtColor(precheck_image, cv2.COLOR_BGR2GRAY)
                if len(precheck_image.shape) == 3
                else precheck_image
            )
            result['timings_ms']['gray_ms'] = (perf_counter() - gray_start) * 1000

            laplacian_start = perf_counter()
            avg_brightness = float(np.mean(gray))
            laplacian_var = float(cv2.Laplacian(gray, cv2.CV_64F).var())
            result['timings_ms']['laplacian_ms'] = (perf_counter() - laplacian_start) * 1000

            result['brightness'] = avg_brightness
            result['sharpness'] = laplacian_var

            if avg_brightness < 20 or avg_brightness > 235:
                result['reason'] = 'Poor lighting conditions'
                return result

            if laplacian_var < 50:
                result['reason'] = f"Image terlalu blur (sharpness: {laplacian_var:.0f}, minimum: 50)"
                return result

            detector_name = 'haar'
            if self.face_cascade.empty():
                faces = []
                detector_name = 'none'
            else:
                haar_start = perf_counter()
                faces = self.face_cascade.detectMultiScale(
                    gray,
                    scaleFactor=1.1,
                    minNeighbors=3,
                    minSize=(30, 30)
                )
                result['timings_ms']['haar_ms'] = (perf_counter() - haar_start) * 1000

            result['face_count'] = int(len(faces))

            if len(faces) == 0:
                # Run the expensive fallback only on the already-downscaled precheck frame.
                detector_name = 'mediapipe_fallback'
                fallback_start = perf_counter()
                mediapipe_face = self._detect_face_box_with_mediapipe(precheck_image)
                result['timings_ms']['mediapipe_fallback_ms'] = (
                    (perf_counter() - fallback_start) * 1000
                )
                if mediapipe_face is not None:
                    faces = [mediapipe_face]
                    result['face_count'] = 1

            result['detector'] = detector_name

            # Estimate relative distance from face area ratio (largest face box vs full frame).
            if len(faces) > 0:
                largest_face = max(faces, key=lambda face_box: int(face_box[2]) * int(face_box[3]))
                _, _, w, h = largest_face
                frame_area = float(gray.shape[0] * gray.shape[1])
                face_area = float(w * h)
                face_box_ratio = (face_area / frame_area) if frame_area > 0 else 0.0
                result['face_box_ratio'] = face_box_ratio

                if face_box_ratio >= 0.32:
                    result['distance_category'] = 'Terlalu dekat'
                elif face_box_ratio <= 0.12:
                    result['distance_category'] = 'Terlalu jauh'
                else:
                    result['distance_category'] = 'Ideal'

            if len(faces) != 1:
                result['reason'] = f"Expected 1 face, found {len(faces)}"
                return result

            result['is_valid'] = True
            result['reason'] = 'Valid'
            logger.info(
                (
                    "Face precheck PASSED | Laplacian: %.0f | Brightness: %.0f | "
                    "Faces: %d | Detector: %s | timings_ms=%s"
                ),
                laplacian_var,
                avg_brightness,
                len(faces),
                detector_name,
                {
                    key: round(float(value), 2)
                    for key, value in result['timings_ms'].items()
                },
            )
            return result

        except Exception as e:
            logger.error(f"Face validation error: {e}")
            result['reason'] = f"Validation error: {str(e)}"
            return result

    def extract_single_embedding(self, image: np.ndarray) -> Optional[List[float]]:
        """
        Extract a single embedding from a face image using DeepFace

        Args:
            image: Face image as numpy array

        Returns:
            Embedding vector as list of floats, or None if no face detected
        """
        try:
            # Convert BGR to RGB if needed (OpenCV loads as BGR)
            if len(image.shape) == 3 and image.shape[2] == 3:
                resized = self._resize_with_max_dim(image, self.EMBEDDING_MAX_DIM)
                image_rgb = cv2.cvtColor(resized, cv2.COLOR_BGR2RGB)
            else:
                image_rgb = self._resize_with_max_dim(image, self.EMBEDDING_MAX_DIM)

            # Extract embedding using DeepFace
            embedding_objs = DeepFace.represent(
                img_path=image_rgb,
                model_name=self.model_name,
                detector_backend=self.detector_backend,
                enforce_detection=True
            )

            if embedding_objs and len(embedding_objs) > 0:
                # Extract the first embedding
                embedding = embedding_objs[0]["embedding"]
                return embedding.tolist() if isinstance(embedding, np.ndarray) else embedding
            else:
                logger.warning("No embedding extracted from image")
                return None

        except Exception as e:
            logger.error(f"Error extracting embedding: {e}")
            return None

    def calculate_average_embedding(self, embeddings_list: List[List[float]]) -> Optional[List[float]]:
        """
        Calculate the mathematical mean of multiple embeddings for a user

        Args:
            embeddings_list: List of embeddings to average

        Returns:
            Average embedding as list of floats
        """
        if not embeddings_list or len(embeddings_list) == 0:
            return None

        try:
            # Convert to numpy array and calculate mean
            embeddings_array = np.array(embeddings_list)
            average_embedding = np.mean(embeddings_array, axis=0)
            return average_embedding.tolist()
        except Exception as e:
            logger.error(f"Error calculating average embedding: {e}")
            return None

    def detect_liveness_simple(self, image: np.ndarray) -> Tuple[bool, float]:
        """
        Simple active liveness detection using face landmarks

        Args:
            image: Face image to analyze

        Returns:
            Tuple of (is_live, confidence_score)
        """
        try:
            # Get face mesh landmarks
            rgb_image = self._to_rgb(image)
            results = self.face_mesh.process(rgb_image)

            if results.multi_face_landmarks:
                # For simplicity, we just check if face landmarks are detected
                # In production, implement blink detection, head movement, etc.
                num_landmarks = len(results.multi_face_landmarks[0].landmark)

                # Basic liveness check: if we have sufficient landmarks (468 is standard for face mesh)
                is_live = num_landmarks >= 300  # Adjust threshold as needed
                confidence = min(num_landmarks / 468.0, 1.0)

                return is_live, confidence
            else:
                return False, 0.0

        except Exception as e:
            logger.error(f"Liveness detection error: {e}")
            return False, 0.0

    def validate_face_quality(self, image: np.ndarray) -> Tuple[bool, str]:
        """
        Validate face image quality for recognition

        Args:
            image: Face image to validate

        Returns:
            Tuple of (is_valid, reason)
        """
        precheck = self.fast_face_precheck(image)
        return bool(precheck['is_valid']), str(precheck['reason'])

    def extract_embeddings_batch(self, images: List[np.ndarray]) -> List[Optional[List[float]]]:
        """
        Extract embeddings from a batch of images

        Args:
            images: List of face images

        Returns:
            List of embedding vectors (some may be None if extraction failed)
        """
        embeddings = []
        for image in images:
            embedding = self.extract_single_embedding(image)
            embeddings.append(embedding)
        
        return embeddings
