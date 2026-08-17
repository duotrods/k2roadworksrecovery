import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

// Mouse/touch-driven signature canvas. Exposes isEmpty/clear/toBlob via ref
// so the parent form can decide when to upload the drawn signature.
const SignaturePad = forwardRef(({ width = 1000, height = 160 }, ref) => {
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);
  const hasDrawnRef = useRef(false);
  const lastPointRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const ctx = canvasRef.current.getContext("2d");
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#1f2937";
  }, []);

  const getPoint = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: ((clientX - rect.left) / rect.width) * canvas.width,
      y: ((clientY - rect.top) / rect.height) * canvas.height,
    };
  };

  const startDrawing = (e) => {
    e.preventDefault();
    drawingRef.current = true;
    lastPointRef.current = getPoint(e);
  };

  const draw = (e) => {
    if (!drawingRef.current) return;
    e.preventDefault();
    const point = getPoint(e);
    const ctx = canvasRef.current.getContext("2d");
    ctx.beginPath();
    ctx.moveTo(lastPointRef.current.x, lastPointRef.current.y);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
    lastPointRef.current = point;
    hasDrawnRef.current = true;
  };

  const stopDrawing = () => {
    drawingRef.current = false;
  };

  useImperativeHandle(ref, () => ({
    isEmpty: () => !hasDrawnRef.current,
    clear: () => {
      const canvas = canvasRef.current;
      canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
      hasDrawnRef.current = false;
    },
    toBlob: () =>
      new Promise((resolve) => {
        canvasRef.current.toBlob((blob) => resolve(blob), "image/png");
      }),
  }));

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className="border border-gray-300 rounded-lg bg-white touch-none w-full cursor-crosshair"
      onMouseDown={startDrawing}
      onMouseMove={draw}
      onMouseUp={stopDrawing}
      onMouseLeave={stopDrawing}
      onTouchStart={startDrawing}
      onTouchMove={draw}
      onTouchEnd={stopDrawing}
    />
  );
});

SignaturePad.displayName = "SignaturePad";

export default SignaturePad;
