"use client";

import { useEffect, useRef, memo } from "react";
import { motion } from "framer-motion";

interface VoiceWaveformProps {
  analyserNode: AnalyserNode | null;
  isRecording: boolean;
}

const NUM_BARS = 48;
const BAR_WIDTH = 2;
const BAR_GAP = 3;
const MIN_HEIGHT = 2;
const MAX_HEIGHT = 8;

function VoiceWaveformComponent({
  analyserNode,
  isRecording,
}: VoiceWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);
  const dataArrayRef = useRef<Uint8Array<ArrayBuffer> | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !analyserNode || !isRecording) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const bufferLength = analyserNode.frequencyBinCount;
    dataArrayRef.current = new Uint8Array(bufferLength);

    const dpr = window.devicePixelRatio || 1;
    const width = NUM_BARS * (BAR_WIDTH + BAR_GAP) - BAR_GAP;
    const height = MAX_HEIGHT * 2;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    const barColor = "#8FAE82"; // sage

    const draw = () => {
      if (!dataArrayRef.current || !ctx || !analyserNode) return;
      analyserNode.getByteFrequencyData(dataArrayRef.current);
      ctx.clearRect(0, 0, width, height);

      const step = Math.floor(bufferLength / NUM_BARS);
      for (let i = 0; i < NUM_BARS; i++) {
        let sum = 0;
        const startIdx = i * step;
        for (let j = 0; j < step; j++) {
          sum += dataArrayRef.current[startIdx + j] || 0;
        }
        const avg = sum / step;
        const normalizedHeight = avg / 255;
        const barHeight = Math.max(MIN_HEIGHT, normalizedHeight * MAX_HEIGHT);
        const x = i * (BAR_WIDTH + BAR_GAP);
        const centerY = height / 2;
        const opacity = 0.5 + normalizedHeight * 0.5;

        ctx.fillStyle = barColor;
        ctx.globalAlpha = opacity;
        ctx.beginPath();
        ctx.roundRect(x, centerY - barHeight, BAR_WIDTH, barHeight, BAR_WIDTH / 2);
        ctx.fill();
        ctx.beginPath();
        ctx.roundRect(x, centerY, BAR_WIDTH, barHeight, BAR_WIDTH / 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      animationRef.current = requestAnimationFrame(draw);
    };

    draw();
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
    };
  }, [analyserNode, isRecording]);

  if (!isRecording || !analyserNode) return null;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.2 }}
      className="flex w-full items-center justify-center"
    >
      <canvas
        ref={canvasRef}
        className="block"
        style={{
          width: NUM_BARS * (BAR_WIDTH + BAR_GAP) - BAR_GAP,
          maxWidth: "100%",
          height: MAX_HEIGHT * 2,
        }}
      />
    </motion.div>
  );
}

export const VoiceWaveform = memo(VoiceWaveformComponent);
