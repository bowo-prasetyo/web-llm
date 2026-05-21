# WebLLM Browser Chat

Pure client-side browser AI chat application using:

- Vue 3 CDN
- Vue Router CDN
- WebLLM
- WebGPU
- Web Worker
- OPFS
- Qwen2.5-0.5B-Instruct

## Requirements

Modern browser with WebGPU support.

Recommended:

- Chrome 121+
- Edge latest
- Safari latest

## Run Locally

Because WebGPU and Worker modules require HTTP origin,
you should use a local web server.

Example:

```bash
python -m http.server 8080
````

Then open:

```text
http://localhost:8080
```

## Deploy to GitHub Pages

1. Create GitHub repository
2. Upload files
3. Push repository
4. Open:

Settings → Pages

5. Configure:

* Source: Deploy from branch
* Branch: main
* Folder: /root

6. Save

GitHub Pages URL:

```text
https://YOUR_USERNAME.github.io/YOUR_REPOSITORY/
```

## Notes

First load downloads the model.

The model is cached locally afterward.

Inference runs entirely inside the browser.

No backend server is used.
