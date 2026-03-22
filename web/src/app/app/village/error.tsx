'use client';

export default function VillageError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const isWebGLError =
    error.message.includes('WebGL') ||
    error.message.includes('context') ||
    error.message.includes('THREE') ||
    error.message.includes('gl');

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-4 bg-background p-8">
      <div className="text-4xl">
        {isWebGLError ? '🖥️' : '⚠️'}
      </div>
      <h2 className="text-xl font-semibold text-foreground">
        {isWebGLError
          ? '3D visualization not supported'
          : 'Something went wrong'}
      </h2>
      <p className="max-w-md text-center text-foreground-muted">
        {isWebGLError
          ? 'Your browser or device may not support WebGL graphics. Try using a modern browser like Chrome, Firefox, or Edge.'
          : error.message}
      </p>
      <div className="flex gap-3">
        <button
          onClick={reset}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-background transition-colors hover:bg-primary/90"
        >
          Try again
        </button>
        <a
          href="/app/graph"
          className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-background-secondary"
        >
          Use 2D graph instead
        </a>
      </div>
    </div>
  );
}
