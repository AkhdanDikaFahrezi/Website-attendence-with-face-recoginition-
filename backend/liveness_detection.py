"""
Active Liveness Detection Service
Detects attempts to spoof face recognition using photos or videos
"""
import cv2
import numpy as np
import mediapipe as mp
import logging
from typing import Tuple, Dict, List
from enum import Enum

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class LivenessChallenge(Enum):
    BLINK = "blink"
    LOOK_LEFT = "look_left"
    LOOK_RIGHT = "look_right"
    SMILE = "smile"
    MOVE_HEAD = "move_head"

class ActiveLivenessDetection:
    def __init__(self):
        # Initialize MediaPipe Face Mesh
        self.mp_face_mesh = mp.solutions.face_mesh
        self.mp_drawing = mp.solutions.drawing_utils
        self.face_mesh = self.mp_face_mesh.FaceMesh(
            static_image_mode=False,
            max_num_faces=1,
            refine_landmarks=True,
            min_detection_confidence=0.5
        )

        # Landmark indices for eye tracking
        self.LEFT_EYE_INDICES = [362, 385, 387, 263, 373, 380]  # Left eye landmarks
        self.RIGHT_EYE_INDICES = [33, 160, 158, 133, 153, 144]  # Right eye landmarks
        
        # Landmark indices for mouth tracking
        self.MOUTH_OUTLINE_INDICES = [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 375, 321, 405, 314, 17, 84, 181, 91, 146, 61]
        
        # Head pose estimation points
        self.HEAD_POSE_POINTS = [1, 33, 133, 152, 362, 263]  # Nose, eyes, jaw points

    def detect_eyes_closed(self, landmarks, image_shape) -> Tuple[bool, float]:
        """
        Detect if eyes are closed using EAR (Eye Aspect Ratio)

        Args:
            landmarks: Face landmarks from MediaPipe
            image_shape: Shape of the input image

        Returns:
            Tuple of (eyes_closed, confidence_score)
        """
        try:
            h, w = image_shape[:2]

            # Get left eye landmarks
            left_eye_points = []
            for idx in self.LEFT_EYE_INDICES:
                landmark = landmarks.landmark[idx]
                x, y = int(landmark.x * w), int(landmark.y * h)
                left_eye_points.append([x, y])

            # Get right eye landmarks
            right_eye_points = []
            for idx in self.RIGHT_EYE_INDICES:
                landmark = landmarks.landmark[idx]
                x, y = int(landmark.x * w), int(landmark.y * h)
                right_eye_points.append([x, y])

            # Calculate EAR for both eyes
            def calculate_ear(eye_points):
                # Vertical distances
                A = np.linalg.norm(np.array(eye_points[1]) - np.array(eye_points[5]))
                B = np.linalg.norm(np.array(eye_points[2]) - np.array(eye_points[4]))
                # Horizontal distance
                C = np.linalg.norm(np.array(eye_points[0]) - np.array(eye_points[3]))

                if C == 0:
                    return 0.0

                ear = (A + B) / (2.0 * C)
                return ear

            left_ear = calculate_ear(left_eye_points)
            right_ear = calculate_ear(right_eye_points)

            # Average EAR
            avg_ear = (left_ear + right_ear) / 2.0

            # EAR threshold for blinking (typically 0.2-0.3)
            eye_closed_threshold = 0.22
            eyes_closed = avg_ear < eye_closed_threshold

            # Confidence score based on how far EAR is from threshold
            confidence = max(0.0, min(1.0, abs(avg_ear - eye_closed_threshold) / 0.3))

            return eyes_closed, confidence

        except Exception as e:
            logger.error(f"Error detecting eyes closure: {e}")
            return False, 0.0

    def detect_smile(self, landmarks, image_shape) -> Tuple[bool, float]:
        """
        Detect if person is smiling based on mouth aspect ratio

        Args:
            landmarks: Face landmarks from MediaPipe
            image_shape: Shape of the input image

        Returns:
            Tuple of (is_smiling, confidence_score)
        """
        try:
            h, w = image_shape[:2]

            # Get mouth landmarks
            mouth_points = []
            for idx in self.MOUTH_OUTLINE_INDICES:
                landmark = landmarks.landmark[idx]
                x, y = int(landmark.x * w), int(landmark.y * h)
                mouth_points.append([x, y])

            # Calculate mouth aspect ratio (MAR)
            # Width: distance between corners of mouth
            corner_left = np.array(mouth_points[0])  # Left corner
            corner_right = np.array(mouth_points[14])  # Right corner
            mouth_width = np.linalg.norm(corner_right - corner_left)

            # Height: distance between top and bottom of mouth
            top_mouth = np.array(mouth_points[7])  # Top of mouth
            bottom_mouth = np.array(mouth_points[10])  # Bottom of mouth
            mouth_height = np.linalg.norm(bottom_mouth - top_mouth)

            if mouth_width == 0:
                return False, 0.0

            mar = mouth_height / mouth_width

            # Threshold for smile detection (typically higher MAR means wider smile)
            smile_threshold = 0.4
            is_smiling = mar > smile_threshold

            # Confidence based on how much MAR exceeds threshold
            confidence = min(1.0, (mar - 0.2) / 0.5) if mar > 0.2 else 0.0

            return is_smiling, confidence

        except Exception as e:
            logger.error(f"Error detecting smile: {e}")
            return False, 0.0

    def estimate_head_pose(self, landmarks, image_shape) -> Tuple[bool, float, Dict]:
        """
        Estimate head pose to detect head movements

        Args:
            landmarks: Face landmarks from MediaPipe
            image_shape: Shape of the input image

        Returns:
            Tuple of (pose_valid, confidence_score, pose_info)
        """
        try:
            h, w = image_shape[:2]

            # Get head pose reference points
            points_3d = np.array([
                [0.0, 0.0, 0.0],              # Nose
                [0.0, -300.0, 0.0],           # Chin
                [-225.0, 170.0, -135.0],      # Left eye left corner
                [225.0, 170.0, -135.0],       # Right eye right corne
                [-150.0, -150.0, -125.0],     # Left Mouth corner
                [150.0, -150.0, -125.0]       # Right mouth corner
            ])

            # Get corresponding 2D points
            points_2d = []
            for idx in self.HEAD_POSE_POINTS:
                landmark = landmarks.landmark[idx]
                x, y = int(landmark.x * w), int(landmark.y * h)
                points_2d.append([x, y])
            
            # Convert to numpy array
            points_2d = np.array(points_2d, dtype=np.float32)

            # Camera matrix (assuming standard camera parameters)
            focal_length = image_shape[1]
            center = (image_shape[1]/2, image_shape[0]/2)
            camera_matrix = np.array([
                [focal_length, 0, center[0]],
                [0, focal_length, center[1]],
                [0, 0, 1]], dtype=np.float32)

            # Distortion coefficients
            dist_coeffs = np.zeros((4,1))

            # Solve PnP to get rotation and translation vectors
            success, rotation_vec, translation_vec = cv2.solvePnP(
                points_3d, points_2d, camera_matrix, dist_coeffs)

            if success:
                # Convert rotation vector to rotation matrix
                rotation_mat, _ = cv2.Rodrigues(rotation_vec)
                
                # Calculate Euler angles
                euler_angles = cv2.decomposeProjectionMatrix(
                    np.hstack((rotation_mat, translation_vec)))[6]
                pitch, yaw, roll = euler_angles.flatten()

                pose_info = {
                    'pitch': float(pitch),
                    'yaw': float(yaw),
                    'roll': float(roll)
                }

                # Valid pose if angles are within reasonable range
                pose_valid = (abs(pitch) < 30 and abs(yaw) < 30 and abs(roll) < 20)
                confidence = 1.0 - min(1.0, (abs(pitch) + abs(yaw) + abs(roll)) / 100.0)

                return pose_valid, confidence, pose_info
            else:
                return False, 0.0, {'pitch': 0.0, 'yaw': 0.0, 'roll': 0.0}

        except Exception as e:
            logger.error(f"Error estimating head pose: {e}")
            return False, 0.0, {'pitch': 0.0, 'yaw': 0.0, 'roll': 0.0}

    def detect_head_movement(self, previous_landmarks, current_landmarks) -> Tuple[bool, float]:
        """
        Detect head movement for liveness check

        Args:
            previous_landmarks: Previous frame landmarks
            current_landmarks: Current frame landmarks

        Returns:
            Tuple of (head_moved, confidence_score)
        """
        try:
            if not previous_landmarks or not current_landmarks:
                return False, 0.0

            # Get nose tip coordinates for both frames
            nose_prev = [previous_landmarks.landmark[1].x, previous_landmarks.landmark[1].y]
            nose_curr = [current_landmarks.landmark[1].x, current_landmarks.landmark[1].y]

            # Calculate movement distance
            movement_distance = np.sqrt((nose_curr[0] - nose_prev[0])**2 + (nose_curr[1] - nose_prev[1])**2)

            # Threshold for significant movement (adjustable)
            movement_threshold = 0.02  # 2% of image dimension
            head_moved = movement_distance > movement_threshold

            # Confidence based on movement magnitude
            confidence = min(1.0, movement_distance / 0.1)  # Cap at 10% movement

            return head_moved, confidence

        except Exception as e:
            logger.error(f"Error detecting head movement: {e}")
            return False, 0.0

    def perform_active_liveness(self, frames_sequence: List[np.ndarray]) -> Tuple[bool, List[Dict]]:
        """
        Perform active liveness detection on a sequence of frames

        Args:
            frames_sequence: Sequence of frames to analyze

        Returns:
            Tuple of (is_live, challenge_results)
        """
        try:
            challenges_results = []
            landmarks_history = []

            for i, frame in enumerate(frames_sequence):
                # Convert BGR to RGB
                rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

                # Process face mesh
                results = self.face_mesh.process(rgb_frame)

                if results.multi_face_landmarks:
                    current_landmarks = results.multi_face_landmarks[0]
                    landmarks_history.append(current_landmarks)

                    # Check for blink detection
                    if len(landmarks_history) >= 2:
                        eyes_closed, blink_confidence = self.detect_eyes_closed(current_landmarks, frame.shape)

                        if eyes_closed and blink_confidence > 0.5:
                            challenges_results.append({
                                'challenge': 'blink_detected',
                                'success': True,
                                'confidence': blink_confidence,
                                'frame_idx': i
                            })

                    # Check for head movement
                    if len(landmarks_history) >= 2:
                        prev_landmarks = landmarks_history[-2]
                        head_moved, movement_confidence = self.detect_head_movement(prev_landmarks, current_landmarks)

                        if head_moved and movement_confidence > 0.3:
                            challenges_results.append({
                                'challenge': 'head_movement_detected',
                                'success': True,
                                'confidence': movement_confidence,
                                'frame_idx': i
                            })

                    # Check for smile
                    is_smiling, smile_confidence = self.detect_smile(current_landmarks, frame.shape)
                    if is_smiling and smile_confidence > 0.6:
                        challenges_results.append({
                            'challenge': 'smile_detected',
                            'success': True,
                            'confidence': smile_confidence,
                            'frame_idx': i
                        })

                    # Check head pose stability
                    pose_valid, pose_confidence, pose_info = self.estimate_head_pose(current_landmarks, frame.shape)
                    if pose_valid:
                        challenges_results.append({
                            'challenge': 'pose_valid',
                            'success': True,
                            'confidence': pose_confidence,
                            'frame_idx': i,
                            'pose_info': pose_info
                        })
                else:
                    challenges_results.append({
                        'challenge': 'face_not_detected',
                        'success': False,
                        'confidence': 0.0,
                        'frame_idx': i
                    })

            # Determine overall liveness based on challenges passed
            successful_challenges = [cr for cr in challenges_results if cr['success']]
            liveness_score = len(successful_challenges) / len(challenges_results) if challenges_results else 0.0

            # Consider live if at least one liveness check passed with good confidence
            is_live = liveness_score > 0.3

            return is_live, challenges_results

        except Exception as e:
            logger.error(f"Error performing active liveness: {e}")
            return False, [{'challenge': 'error', 'success': False, 'confidence': 0.0, 'frame_idx': 0}]

    def perform_passive_liveness(self, frame: np.ndarray) -> Tuple[bool, float]:
        """
        Perform passive liveness detection on a single frame
        Uses texture analysis and image quality metrics

        Args:
            frame: Single frame to analyze

        Returns:
            Tuple of (is_live, confidence_score)
        """
        try:
            # Convert to grayscale for analysis
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)

            # Calculate image sharpness using Laplacian variance
            laplacian_var = cv2.Laplacian(gray, cv2.CV_64F).var()

            # Calculate texture features using Local Binary Patterns (simplified)
            # For a more robust solution, consider using a trained CNN model
            texture_score = laplacian_var / 1000.0  # Normalize

            # Check for unnatural uniformity (common in printed photos)
            std_dev = np.std(gray)
            uniformity_score = 1.0 - (std_dev / 128.0)  # Inverse relationship

            # Combined liveness score
            # Real faces typically have good texture and some variation
            combined_score = (texture_score * 0.7 + (1 - uniformity_score) * 0.3)
            combined_score = min(1.0, max(0.0, combined_score))

            # Threshold for liveness
            is_live = combined_score > 0.4
            confidence = combined_score

            return is_live, confidence

        except Exception as e:
            logger.error(f"Error performing passive liveness: {e}")
            return False, 0.0

    def enhanced_liveness_check(self, frames_sequence: List[np.ndarray]) -> Dict:
        """
        Enhanced liveness check combining active and passive methods

        Args:
            frames_sequence: Sequence of frames to analyze

        Returns:
            Dictionary with detailed liveness analysis
        """
        try:
            # Perform active liveness
            active_is_live, active_results = self.perform_active_liveness(frames_sequence)

            # Perform passive liveness on the first frame (or average)
            if frames_sequence:
                passive_is_live, passive_confidence = self.perform_passive_liveness(frames_sequence[0])
            else:
                passive_is_live, passive_confidence = False, 0.0

            # Combine results
            active_success_count = sum(1 for r in active_results if r['success'])
            active_total_count = len(active_results) if active_results else 1
            active_success_rate = active_success_count / active_total_count

            # Overall liveness decision
            overall_is_live = active_is_live or (passive_is_live and passive_confidence > 0.6)

            # Calculate overall confidence
            overall_confidence = (active_success_rate * 0.6 + passive_confidence * 0.4)

            return {
                'is_live': overall_is_live,
                'confidence': overall_confidence,
                'active_liveness': {
                    'passed': active_is_live,
                    'success_rate': active_success_rate,
                    'results': active_results
                },
                'passive_liveness': {
                    'passed': passive_is_live,
                    'confidence': passive_confidence
                },
                'recommendation': 'accept' if overall_is_live else 'reject'
            }

        except Exception as e:
            logger.error(f"Error in enhanced liveness check: {e}")
            return {
                'is_live': False,
                'confidence': 0.0,
                'active_liveness': {
                    'passed': False,
                    'success_rate': 0.0,
                    'results': []
                },
                'passive_liveness': {
                    'passed': False,
                    'confidence': 0.0
                },
                'recommendation': 'error'
            }