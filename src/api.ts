import axios, { AxiosInstance } from "axios"

export interface Memo {
  name: string
  content: string
  createTime?: string
  createdTs?: string
  attachments?: Attachment[]
}

export interface Attachment {
  name: string
  filename: string
  type: string
  size: number | string
  externalLink?: string
}

export interface ApiResponse {
  success: boolean
  error?: string
  data?: any
}

export class MemosAPI {
  private host: string
  private client: AxiosInstance

  constructor(host: string, token: string) {
    this.host = host.replace(/\/$/, "")

    this.client = axios.create({
      baseURL: this.host,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Cookie: `memos.access-token=${token}`
      },
      timeout: 10000
    })
  }

  async createMemo(content: string, visibility: string = "PRIVATE"): Promise<ApiResponse> {
    try {
      const response = await this.client.post("/api/v1/memos", {
        content,
        visibility
      })

      if (response.status === 200 || response.status === 201) {
        return { success: true, data: response.data }
      }

      return {
        success: false,
        error: `Create failed (HTTP ${response.status}): ${JSON.stringify(response.data)}`
      }
    } catch (error: any) {
      if (error.response) {
        return {
          success: false,
          error: `HTTP error: ${error.response.status} - ${JSON.stringify(error.response.data).substring(0, 200)}`
        }
      } else if (error.request) {
        return { success: false, error: `Network error: ${error.message}` }
      }
      return { success: false, error: `Unknown error: ${error.message}` }
    }
  }

  async updateMemo(memoName: string, content: string): Promise<ApiResponse> {
    try {
      const response = await this.client.patch(`/api/v1/${memoName}`, {
        content
      })

      if (response.status === 200) {
        return { success: true, data: response.data }
      }

      return {
        success: false,
        error: `Update failed (HTTP ${response.status}): ${JSON.stringify(response.data)}`
      }
    } catch (error: any) {
      if (error.response) {
        return {
          success: false,
          error: `HTTP error: ${error.response.status} - ${JSON.stringify(error.response.data).substring(0, 200)}`
        }
      } else if (error.request) {
        return { success: false, error: `Network error: ${error.message}` }
      }
      return { success: false, error: `Unknown error: ${error.message}` }
    }
  }

  async listMemos(page: number = 1, pageSize: number = 20): Promise<{ memos: Memo[]; error?: string }> {
    try {
      const response = await this.client.get(`/api/v1/memos?page=${page}&pageSize=${pageSize}`)

      const data = response.data

      if (Array.isArray(data)) {
        return { memos: data }
      } else if (typeof data === "object") {
        if (data.memos) {
          return { memos: data.memos }
        } else if (data.data) {
          return { memos: data.data }
        }
        return { memos: [], error: `Invalid response format: ${Object.keys(data).join(", ")}` }
      }

      return { memos: [], error: "Invalid response format" }
    } catch (error: any) {
      if (error.response) {
        return {
          memos: [],
          error: `HTTP error: ${error.response.status} - ${JSON.stringify(error.response.data).substring(0, 200)}`
        }
      } else if (error.request) {
        return { memos: [], error: `Network error: ${error.message}` }
      }
      return { memos: [], error: `Unknown error: ${error.message}` }
    }
  }

  async searchMemos(query: string): Promise<{ memos: Memo[]; error?: string }> {
    try {
      const { memos, error } = await this.listMemos(1, 100)
      if (error) {
        return { memos: [], error }
      }

      const queryLower = query.toLowerCase()
      const filtered = memos.filter(memo => memo.content?.toLowerCase().includes(queryLower))

      return { memos: filtered }
    } catch (error: any) {
      return { memos: [], error: `Search error: ${error.message}` }
    }
  }

  async deleteMemo(memoName: string): Promise<ApiResponse> {
    try {
      const response = await this.client.delete(`/api/v1/${memoName}`)

      if (response.status === 200 || response.status === 204) {
        return { success: true }
      }

      return { success: false, error: `Delete failed (HTTP ${response.status})` }
    } catch (error: any) {
      if (error.response) {
        return {
          success: false,
          error: `HTTP error: ${error.response.status} - ${JSON.stringify(error.response.data).substring(0, 200)}`
        }
      } else if (error.request) {
        return { success: false, error: `Network error: ${error.message}` }
      }
      return { success: false, error: `Unknown error: ${error.message}` }
    }
  }

  buildAttachmentUrl(attachment: Attachment): string {
    if (attachment.externalLink) {
      return attachment.externalLink
    }

    if (!attachment.name || !attachment.filename) {
      return ""
    }

    return `${this.host}/file/${attachment.name}/${encodeURIComponent(attachment.filename)}`
  }

  /**
   * Fetch image with authentication
   * @param url Image URL
   * @returns Image buffer
   */
  async fetchImage(url: string): Promise<Buffer> {
    const response = await this.client.get(url, {
      responseType: "arraybuffer"
    })
    return Buffer.from(response.data)
  }
}
