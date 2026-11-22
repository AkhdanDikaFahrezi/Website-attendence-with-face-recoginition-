'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import pict1 from '@/app/GambarloginPage/pict 1.png';
import pict2 from '@/app/GambarloginPage/pict 2.png';
import pict3 from '@/app/GambarloginPage/pict 3.png';

interface FaceCarouselProps {
  className?: string;
}

const slides = [
  {
    src: pict1,
    alt: 'Convolutional Neural Network Architecture',
  },
  {
    src: pict2,
    alt: 'Face Recognition with CNN',
  },
  {
    src: pict3,
    alt: 'Smart Face Recognition System',
  },
];

export function FaceCarousel({ className }: FaceCarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const totalSlides = slides.length;

  // Automatic slide rotation every 5 seconds
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % totalSlides);
    }, 5000); // Change slide every 5 seconds

    return () => clearInterval(timer); // Cleanup on unmount
  }, [totalSlides]);

  const goToSlide = (index: number) => {
    setCurrentIndex(index);
  };

  return (
    <div className={`relative w-full h-full flex flex-col items-center justify-center ${className}`}>
      {/* NeuralScan AI Logo */}
      <div className="absolute top-6 left-6 z-10">
        <h2 className="text-2xl font-bold bg-gradient-to-r from-purple-400 to-purple-600 bg-clip-text text-transparent">
          NeuralScan AI
        </h2>
      </div>

      {/* Image Slider Container */}
      <div className="relative w-full h-full flex items-center justify-center p-6 md:p-10">
        <div className="relative w-full h-full max-w-2xl">
          {/* Slides */}
          {slides.map((slide, index) => (
            <div
              key={index}
              className={`absolute inset-0 transition-opacity duration-1000 ${
                index === currentIndex ? 'opacity-100' : 'opacity-0'
              }`}
            >
              <Image
                src={slide.src}
                alt={slide.alt}
                fill
                className="object-contain rounded-lg"
                priority={index === 0}
                sizes="(max-width: 768px) 100vw, 50vw"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Slogan */}
      <div className="absolute bottom-20 md:bottom-24 text-center px-4">
        <p className="text-lg md:text-xl font-light text-purple-200/80 tracking-wide">
          Keamanan Presisi, Keandalan CNN
        </p>
      </div>

      {/* Pagination Dots */}
      <div className="absolute bottom-10 md:bottom-12 flex items-center gap-3">
        {Array.from({ length: totalSlides }).map((_, index) => (
          <button
            key={index}
            onClick={() => goToSlide(index)}
            className={`transition-all duration-300 rounded-full ${
              index === currentIndex
                ? 'w-8 h-2 bg-purple-400 shadow-lg shadow-purple-500/50'
                : 'w-2 h-2 bg-purple-500/30 hover:bg-purple-500/50'
            }`}
            aria-label={`Go to slide ${index + 1}`}
          />
        ))}
      </div>
    </div>
  );
}
