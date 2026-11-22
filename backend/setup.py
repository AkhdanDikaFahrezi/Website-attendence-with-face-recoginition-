from setuptools import setup, find_packages

setup(
    name="face-recognition-backend",
    version="1.0.0",
    packages=find_packages(),
    install_requires=[
        "Flask==2.3.3",
        "Flask-CORS==4.0.0",
        "psycopg2-binary==2.9.7",
        "python-dotenv==1.0.0",
        "numpy==1.24.3",
        "opencv-python==4.8.1.78",
        "scikit-learn==1.3.0",
        "Pillow==10.0.1",
    ],
    author="CodeGuide",
    description="Flask backend for face recognition attendance system",
    license="MIT",
    python_requires=">=3.8",
)