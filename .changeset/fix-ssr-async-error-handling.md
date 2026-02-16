---
"solid-js": patch
---

Harden SSR async error handling: add try/catch to Loading's async IIFE, serialize errors in createErrorBoundary for client hydration, and fix unhandled promise rejections in processResult
