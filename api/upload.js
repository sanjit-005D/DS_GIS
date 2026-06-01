export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ status: 'error', message: 'Method not allowed' })
  }

  const upstreamUrl = process.env.EYENETBIO_UPLOAD_URL || process.env.UPLOAD_API_URL || 'https://www.eyenetbio.com/api_upload.php'
  const apiKey =
    process.env.EYENETBIO_API_KEY ||
    process.env.API_KEY ||
    process.env.EYENETBIO_KEY ||
    process.env.UPLOAD_API_KEY ||
    process.env.VITE_EYENETBIO_API_KEY ||
    process.env.VITE_API_KEY

  if (!apiKey) {
    return res.status(500).json({
      status: 'error',
      message: 'Server API key not configured. Set EYENETBIO_API_KEY (or API_KEY).'
    })
  }

  try {
    const bodyParams = new URLSearchParams()
    bodyParams.set('api_key', apiKey)

    let incoming = {}
    if (typeof req.body === 'string') {
      incoming = Object.fromEntries(new URLSearchParams(req.body))
    } else if (req.body && typeof req.body === 'object') {
      incoming = req.body
    }

    for (const [key, value] of Object.entries(incoming)) {
      if (key === 'api_key') continue
      if (value === undefined || value === null) continue
      bodyParams.set(key, String(value))
    }

    const upstreamResp = await fetch(upstreamUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json, text/plain, */*'
      },
      body: bodyParams.toString()
    })

    const text = await upstreamResp.text()
    const contentType = upstreamResp.headers.get('content-type') || 'application/json; charset=utf-8'

    res.status(upstreamResp.status)
    res.setHeader('Content-Type', contentType)
    return res.send(text)
  } catch (error) {
    return res.status(502).json({
      status: 'error',
      message: error?.message || 'Upstream request failed'
    })
  }
}
