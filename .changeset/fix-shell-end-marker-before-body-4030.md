---
"@solidjs/web": patch
---

fix(web): the shell-end marker lands before `</body>`, not after `</html>` (#4030)

A render that emits `<HydrationScript />` ends its shell with the shell-end marker script (#3971). `renderToString` and the stream shell appended it after the assembled document, so a complete document ended with `</html><script>…</script>`: a parse error, and a response that no longer ends with `</html>`. The marker is now spliced right before the shell's last `</body>`, which still puts it after every shell node and after the records script, and before any later streamed fragment. A shell without a `</body>`, or whose `</body>` comes before the bootstrap script, keeps the marker appended, so the marker never runs before `_$HY` and the records exist.
