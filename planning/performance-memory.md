# Performance & Memory Optimizations

Goal: handle large log streams and 10+ processes without UI lag.

## Core Idea
Batch output updates, keep memory bounded, and avoid re-rendering the whole UI per log line.

## Benefits
- Smooth UI even under heavy log volume
- Predictable memory usage
- Lower CPU usage from fewer renders
- Better responsiveness to input

## Short Plan
- Batch log updates (e.g., 16–50ms ticks)
- Use ring buffers for logs (no unbounded arrays)
- Re-render only the active viewer on output
- Decouple readiness checks from full log joins
- Add backpressure when output is faster than render
