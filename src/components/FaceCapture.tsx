'use client';

import { useRef, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';

interface FaceCaptureProps {
  onCaptureComplete: (images: string[]) => void;
  capturedImages: string[];
}

interface AngleGuide {
  step: number;
  title: string;
  description: string;
  icon: string;
}

const REQUIRED_FACE_IMAGES = 5;

const angleGuides: AngleGuide[] = [
  {
    step: 1,
    title: 'Depan (Frontal)',
    description: 'Lihat lurus ke kamera dengan ekspresi netral',
    icon: '^',
  },
  {
    step: 2,
    title: 'Depan - Senyum Ringan',
    description: 'Tetap lihat kamera sambil tersenyum ringan natural',
    icon: ':)',
  },
  {
    step: 3,
    title: 'Frontal Variasi Kiri',
    description: 'Tetap lihat kamera; geser wajah sedikit ke kiri tanpa memutar jauh',
    icon: '<',
  },
  {
    step: 4,
    title: 'Frontal Variasi Kanan',
    description: 'Tetap lihat kamera; geser wajah sedikit ke kanan tanpa memutar jauh',
    icon: '>',
  },
  {
    step: 5,
    title: 'Depan - Dagu Netral',
    description: 'Lihat lurus ke kamera dengan posisi dagu natural',
    icon: 'v',
  },
];

export function FaceCapture({ onCaptureComplete, capturedImages }: FaceCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isVideoReady, setIsVideoReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState(1);

  const currentGuide = angleGuides[Math.min(currentStep - 1, REQUIRED_FACE_IMAGES - 1)];
  const progress = (capturedImages.length / REQUIRED_FACE_IMAGES) * 100;

  const startCamera = useCallback(async () => {
    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'user',
        },
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setIsStreaming(true);
        setIsVideoReady(false);
      }
    } catch (err: unknown) {
      const errorName = err instanceof Error ? err.name : '';
      console.error('Camera access error:', err);
      setError(
        errorName === 'NotAllowedError'
          ? 'Akses kamera ditolak. Izinkan akses kamera di browser Anda.'
          : 'Tidak dapat mengakses kamera. Pastikan kamera tersedia.'
      );
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (videoRef.current?.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((track) => track.stop());
      videoRef.current.srcObject = null;
      setIsStreaming(false);
      setIsVideoReady(false);
    }
  }, []);

  const capturePhoto = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !video.videoWidth || !video.videoHeight) {
      setError('Kamera belum siap. Tunggu preview muncul jelas, lalu ambil foto lagi.');
      return;
    }

    setError(null);
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.setTransform(-1, 0, 0, 1, canvas.width, 0);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    const imageData = canvas.toDataURL('image/jpeg', 0.9);
    const newImages = [...capturedImages, imageData];
    onCaptureComplete(newImages);

    if (currentStep < REQUIRED_FACE_IMAGES) {
      setCurrentStep(currentStep + 1);
    } else {
      stopCamera();
    }
  }, [capturedImages, currentStep, onCaptureComplete, stopCamera]);

  const handleFileUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      if (!file.type.startsWith('image/')) {
        setError('File harus berupa gambar (JPG/PNG)');
        return;
      }

      if (file.size > 5 * 1024 * 1024) {
        setError('Ukuran file maksimal 5MB');
        return;
      }

      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        const newImages = [...capturedImages, base64];
        onCaptureComplete(newImages);

        if (currentStep < REQUIRED_FACE_IMAGES) {
          setCurrentStep(currentStep + 1);
        }
      };
      reader.readAsDataURL(file);
    },
    [capturedImages, currentStep, onCaptureComplete]
  );

  const retakeLast = useCallback(() => {
    if (capturedImages.length > 0) {
      const newImages = capturedImages.slice(0, -1);
      onCaptureComplete(newImages);
      setCurrentStep(newImages.length + 1);
    }
  }, [capturedImages, onCaptureComplete]);

  const resetAll = useCallback(() => {
    onCaptureComplete([]);
    setCurrentStep(1);
    stopCamera();
  }, [onCaptureComplete, stopCamera]);

  const isComplete = capturedImages.length === REQUIRED_FACE_IMAGES;

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg">
              {!isComplete
                ? `Foto ${currentStep}/${REQUIRED_FACE_IMAGES}: ${currentGuide.title}`
                : 'Semua Foto Tersimpan!'}
            </CardTitle>
            <CardDescription>
              {!isComplete
                ? currentGuide.description
                : `${REQUIRED_FACE_IMAGES} foto wajah berhasil diambil untuk face recognition`}
            </CardDescription>
          </div>
          <div className="text-4xl">{!isComplete ? currentGuide.icon : 'OK'}</div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex justify-between text-xs text-gray-600 dark:text-gray-400">
            <span>Progress</span>
            <span>{capturedImages.length}/{REQUIRED_FACE_IMAGES} foto</span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>

        {capturedImages.length > 0 && (
          <div className="grid grid-cols-5 gap-2">
            {capturedImages.map((img, idx) => (
              <div key={idx} className="relative aspect-square overflow-hidden rounded-lg border-2 border-green-500">
                <img src={img} alt={`Foto ${idx + 1}`} className="h-full w-full object-cover" />
                <div className="absolute bottom-0 right-0 rounded-tl bg-green-500 px-1 text-xs text-white">
                  {idx + 1}
                </div>
              </div>
            ))}
            {Array.from({ length: REQUIRED_FACE_IMAGES - capturedImages.length }).map((_, idx) => (
              <div
                key={`empty-${idx}`}
                className="flex aspect-square items-center justify-center rounded-lg border-2 border-dashed border-gray-300 text-gray-400 dark:border-gray-700"
              >
                {capturedImages.length + idx + 1}
              </div>
            ))}
          </div>
        )}

        {!isComplete ? (
          <>
            <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-gray-900">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                onCanPlay={() => setIsVideoReady(true)}
                className="absolute inset-0 h-full w-full object-cover"
                style={{
                  zIndex: 10,
                  display: isStreaming ? 'block' : 'none',
                }}
              />

              {isStreaming && (
                <div
                  className="pointer-events-none absolute inset-0 flex items-center justify-center"
                  style={{ zIndex: 20 }}
                >
                  <div className="relative h-48 w-48 rounded-full border-2 border-purple-500/50 md:h-64 md:w-64">
                    <div className="absolute inset-0 animate-pulse rounded-full border-2 border-purple-400/30" />
                    <div className="absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-purple-600/80 px-3 py-1 text-xs text-white">
                      {currentGuide.title}
                    </div>
                  </div>
                </div>
              )}

              {!isStreaming && (
                <div
                  className="absolute inset-0 flex items-center justify-center text-gray-500"
                  style={{ zIndex: 5 }}
                >
                  <div className="text-center">
                    <div className="mb-2 text-5xl">{currentGuide.icon}</div>
                    <p className="text-sm font-medium">{currentGuide.title}</p>
                    <p className="mt-1 text-xs">{currentGuide.description}</p>
                  </div>
                </div>
              )}
            </div>

            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-900 dark:bg-red-950/20">
                <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
              </div>
            )}

            <div className="flex gap-2">
              {!isStreaming ? (
                <Button
                  type="button"
                  onClick={startCamera}
                  className="flex-1 bg-purple-600 hover:bg-purple-700"
                >
                  <svg className="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                    />
                  </svg>
                  Buka Kamera
                </Button>
              ) : (
                <>
                  <Button
                    type="button"
                    onClick={capturePhoto}
                    disabled={!isVideoReady}
                    className="flex-1 bg-purple-600 hover:bg-purple-700"
                  >
                    <svg className="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
                      />
                    </svg>
                    {isVideoReady ? `Ambil Foto ${currentStep}` : 'Menyiapkan Kamera...'}
                  </Button>
                  <Button
                    type="button"
                    onClick={stopCamera}
                    variant="outline"
                    className="border-red-500 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20"
                  >
                    Tutup
                  </Button>
                </>
              )}
            </div>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-200 dark:border-gray-700" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="bg-white px-2 text-gray-500 dark:bg-gray-900">atau upload manual</span>
              </div>
            </div>

            <div className="space-y-2">
              <label
                htmlFor="face-upload"
                className="flex h-24 w-full cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800/50"
              >
                <svg className="mb-1 h-6 w-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
                <p className="text-xs text-gray-600 dark:text-gray-400">
                  Upload foto untuk angle: {currentGuide.title}
                </p>
                <input
                  id="face-upload"
                  type="file"
                  accept="image/jpeg,image/png"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
            </div>

            {capturedImages.length > 0 && (
              <Button
                type="button"
                onClick={retakeLast}
                variant="outline"
                className="w-full"
              >
                <svg className="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"
                  />
                </svg>
                Ambil Ulang Foto Terakhir
              </Button>
            )}
          </>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
              {capturedImages.map((img, idx) => (
                <div key={idx} className="relative aspect-square overflow-hidden rounded-lg border-2 border-green-500">
                  <img src={img} alt={`Foto ${idx + 1}`} className="h-full w-full object-cover" />
                  <div className="absolute left-1 top-1 rounded-full bg-green-500 px-2 py-0.5 text-xs text-white">
                    {idx + 1}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <Button
                type="button"
                onClick={resetAll}
                variant="outline"
                className="flex-1"
              >
                <svg className="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
                Ambil Ulang Semua
              </Button>
              <Button
                type="button"
                onClick={() => {}}
                className="flex-1 bg-green-600 hover:bg-green-700"
                disabled
              >
                <svg className="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
                {REQUIRED_FACE_IMAGES}/{REQUIRED_FACE_IMAGES} Foto Tersimpan
              </Button>
            </div>
          </div>
        )}

        <canvas ref={canvasRef} className="hidden" />
      </CardContent>
    </Card>
  );
}
