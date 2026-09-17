import { createServer } from 'http'
import { mkdir, readdir, stat } from 'fs/promises'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { fileURLToPath, URL } from 'url'
import { pipeline } from 'stream/promises'

const ROOT = path.dirname(fileURLToPath(import.meta.url))
const UPLOAD_DIR = path.resolve(ROOT)
await mkdir(UPLOAD_DIR, { recursive: true })

const HTML = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Upload file</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 24px; background: #0f172a; color: #e2e8f0; }
    .card { max-width: 560px; padding: 20px; border-radius: 16px; background: #111827; box-shadow: 0 8px 30px rgba(0,0,0,.3); }
    button { padding: 10px 16px; border: 0; border-radius: 10px; background: #38bdf8; color: #082f49; font-weight: 700; }
    input { margin: 12px 0; }
    a { color: #7dd3fc; }
    li { margin: 8px 0; }
    .muted { color: #94a3b8; }
  </style>
</head>
<body>
  <div class="card">
    <h2>Upload a file</h2>
    <p class="muted">Choose your image and upload it to this device.</p>
    <input id="file" type="file" />
    <div><button onclick="upload()">Upload</button></div>
    <p id="status"></p>
    <h3>Uploaded files</h3>
    <ul id="files"></ul>
  </div>
  <script>
    async function refreshFiles() {
      const res = await fetch('/list')
      const files = await res.json()
      const ul = document.getElementById('files')
      ul.innerHTML = files.map(name => '<li><a href="/files/' + encodeURIComponent(name) + '" target="_blank">' + name + '</a></li>').join('')
    }
    async function upload() {
      const input = document.getElementById('file')
      const status = document.getElementById('status')
      const file = input.files[0]
      if (!file) {
        status.textContent = 'Please choose a file first.'
        return
      }
      status.textContent = 'Uploading...'
      const res = await fetch('/upload?filename=' + encodeURIComponent(file.name), {
        method: 'PUT',
        body: file,
      })
      status.textContent = await res.text()
      await refreshFiles()
    }
    refreshFiles()
  </script>
</body>
</html>`

function getLanIp() {
  const interfaces = os.networkInterfaces()
  for (const iface of Object.values(interfaces)) {
    if (!iface) continue
    for (const entry of iface) {
      if (entry.family === 'IPv4' && !entry.internal) {
        return entry.address
      }
    }
  }
  return '127.0.0.1'
}

function sendResponse(res, code, body, contentType = 'text/plain; charset=utf-8') {
  const data = typeof body === 'string' ? Buffer.from(body, 'utf8') : body
  res.writeHead(code, {
    'Content-Type': contentType,
    'Content-Length': data.length,
  })
  res.end(data)
}

async function listFiles() {
  const names = []
  const entries = await readdir(UPLOAD_DIR)
  for (const name of entries) {
    if (name === path.basename(fileURLToPath(import.meta.url))) {
      continue
    }
    const target = path.join(UPLOAD_DIR, name)
    try {
      const info = await stat(target)
      if (info.isFile()) {
        names.push(name)
      }
    } catch {
      // ignore unreadable entries
    }
  }
  return names.sort()
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', `http://${req.headers.host}`)
    if (req.method === 'GET') {
      if (url.pathname === '/') {
        sendResponse(res, 200, HTML, 'text/html; charset=utf-8')
        return
      }
      if (url.pathname === '/list') {
        const files = await listFiles()
        sendResponse(res, 200, JSON.stringify(files), 'application/json; charset=utf-8')
        return
      }
      if (url.pathname.startsWith('/files/')) {
        const name = path.basename(decodeURIComponent(url.pathname.slice('/files/'.length)))
        const target = path.join(UPLOAD_DIR, name)
        try {
          const info = await stat(target)
          if (!info.isFile()) {
            sendResponse(res, 404, 'Not found')
            return
          }
        } catch {
          sendResponse(res, 404, 'Not found')
          return
        }
        res.writeHead(200, {
          'Content-Type': 'application/octet-stream',
          'Content-Disposition': `inline; filename="${name}"`,
        })
        fs.createReadStream(target).pipe(res)
        return
      }
    }

    if (req.method === 'PUT' && url.pathname === '/upload') {
      const rawName = url.searchParams.get('filename') || 'upload.bin'
      const name = path.basename(rawName)
      const target = path.join(UPLOAD_DIR, name)
      await pipeline(req, fs.createWriteStream(target))
      sendResponse(res, 200, `Uploaded: ${name}`)
      return
    }

    sendResponse(res, 404, 'Not found')
  } catch (error) {
    console.error(error)
    sendResponse(res, 500, 'Internal server error')
  }
})

const host = '0.0.0.0'
const port = 8008
server.listen(port, host, () => {
  console.log(`UPLOAD_DIR=${UPLOAD_DIR}`)
  console.log(`LOCAL_URL=http://127.0.0.1:${port}`)
  console.log(`LAN_URL=http://${getLanIp()}:${port}`)
})
