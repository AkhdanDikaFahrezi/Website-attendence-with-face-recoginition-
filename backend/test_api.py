"""
Simple test script for the Flask backend API
"""
import requests
import json
import base64

# Base URL for the Flask API
BASE_URL = "http://localhost:5001"

def test_health():
    """Test the health check endpoint"""
    try:
        response = requests.get(f"{BASE_URL}/api/health")
        print(f"Health check: {response.status_code}, Response: {response.json()}")
        return response.status_code == 200
    except Exception as e:
        print(f"Health check failed: {e}")
        return False

def test_register_student():
    """Test the student registration endpoint"""
    try:
        # This is a mock base64 image string for testing purposes
        # In a real scenario, you would provide an actual image
        mock_image = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="
        
        data = {
            "nim": "12345678",
            "name": "Test Student",
            "class_schedule": "Monday 08:00-10:00",
            "semester": "2023/2024",
            "face_image": mock_image
        }
        
        response = requests.post(f"{BASE_URL}/api/register", json=data)
        print(f"Registration test: {response.status_code}, Response: {response.json()}")
        return response.status_code in [201, 400]  # 400 is expected if image is invalid
    except Exception as e:
        print(f"Registration test failed: {e}")
        return False

def test_verify_face():
    """Test the face verification endpoint"""
    try:
        # This is a mock base64 image string for testing purposes
        mock_image = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="
        
        data = {
            "face_image": mock_image
        }
        
        response = requests.post(f"{BASE_URL}/api/verify", json=data)
        print(f"Verification test: {response.status_code}, Response: {response.json()}")
        return response.status_code in [200, 400]  # 400 is expected if image is invalid
    except Exception as e:
        print(f"Verification test failed: {e}")
        return False

def main():
    print("Testing Flask Backend API...")
    
    tests = [
        ("Health Check", test_health),
        ("Register Student", test_register_student),
        ("Verify Face", test_verify_face)
    ]
    
    results = []
    for test_name, test_func in tests:
        print(f"\nRunning {test_name} test...")
        result = test_func()
        results.append((test_name, result))
    
    print("\nTest Results:")
    for test_name, result in results:
        status = "PASS" if result else "FAIL"
        print(f"{test_name}: {status}")
    
    all_passed = all(result for _, result in results)
    print(f"\nOverall: {'PASS' if all_passed else 'FAIL'}")

if __name__ == "__main__":
    main()