import http from "http"
import { Context, PublicAPI } from "@wox-launcher/wox-plugin"
import { MemosAPI } from "./api"

let proxyServer: http.Server | null = null
let proxyPort = 0

/**
 * Start proxy server for authenticated image requests
 */
export async function startProxyServer(ctx: Context, api: PublicAPI, memosApi: MemosAPI | null): Promise<number> {
  if (proxyServer) {
    return proxyPort
  }

  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      try {
        // Parse URL to get the original image URL
        const url = new URL(req.url || "", `http://localhost`)
        const imageUrl = url.searchParams.get("url")

        if (!imageUrl || !memosApi) {
          res.writeHead(404)
          res.end("Not found")
          return
        }

        // Fetch image with authentication using MemosAPI
        const imageBuffer = await memosApi.fetchImage(imageUrl)

        // Forward the image
        res.writeHead(200, {
          "Content-Type": "image/png",
          "Cache-Control": "public, max-age=3600"
        })
        res.end(imageBuffer)
      } catch (error) {
        await api.Log(ctx, "Error", `Proxy error: ${error}`)
        res.writeHead(500)
        res.end("Error fetching image")
      }
    })

    server.listen(0, "127.0.0.1", () => {
      const address = server.address()
      if (address && typeof address !== "string") {
        proxyPort = address.port
        proxyServer = server
        resolve(proxyPort)
      } else {
        reject(new Error("Failed to start proxy server"))
      }
    })

    server.on("error", reject)
  })
}

/**
 * Get current proxy port
 */
export function getProxyPort(): number {
  return proxyPort
}

/**
 * Stop proxy server
 */
export function stopProxyServer(): void {
  if (proxyServer) {
    proxyServer.close()
    proxyServer = null
    proxyPort = 0
  }
}
