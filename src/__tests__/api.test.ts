import { MemosAPI } from "../api"
import dotenv from "dotenv"

// Load environment variables
dotenv.config()

const host = process.env.MEMOS_HOST || ""
const token = process.env.MEMOS_TOKEN || ""

const describeOrSkip = host && token ? describe : describe.skip

describeOrSkip("MemosAPI", () => {
  let api: MemosAPI

  beforeAll(() => {
    api = new MemosAPI(host, token)
  })

  describe("createMemo", () => {
    it("should create a memo successfully", async () => {
      const content = `Test memo created at ${new Date().toISOString()}`
      const result = await api.createMemo(content)

      expect(result.success).toBe(true)
      expect(result.data).toBeDefined()

      // Clean up immediately
      if (result.data && result.data.name) {
        await api.deleteMemo(result.data.name)
      }
    })

    it("should handle creation with custom visibility", async () => {
      const content = "Private test memo"
      const result = await api.createMemo(content, "PRIVATE")

      expect(result.success).toBe(true)

      // Clean up immediately
      if (result.data && result.data.name) {
        await api.deleteMemo(result.data.name)
      }
    })
  })

  describe("listMemos", () => {
    it("should list memos successfully", async () => {
      const { memos, error } = await api.listMemos(1, 10)

      expect(error).toBeUndefined()
      expect(Array.isArray(memos)).toBe(true)
      expect(memos.length).toBeGreaterThan(0)

      // Verify memo structure
      const firstMemo = memos[0]
      expect(firstMemo).toHaveProperty("name")
      expect(firstMemo).toHaveProperty("content")
    })

    it("should respect pagination parameters", async () => {
      const { memos: page1 } = await api.listMemos(1, 5)
      const { memos: page2 } = await api.listMemos(2, 5)

      expect(page1.length).toBeLessThanOrEqual(5)
      expect(page2.length).toBeLessThanOrEqual(5)

      // Note: Pages might be the same if there aren't enough memos for pagination
      // This is expected behavior and not a test failure
    })
  })

  describe("searchMemos", () => {
    it("should search memos by content", async () => {
      const { memos, error } = await api.searchMemos("test")

      expect(error).toBeUndefined()
      expect(Array.isArray(memos)).toBe(true)

      // All results should contain "test" (case-insensitive)
      memos.forEach(memo => {
        expect(memo.content.toLowerCase()).toContain("test")
      })
    })

    it("should return empty array for non-existent search", async () => {
      const uniqueString = `nonexistent_${Date.now()}_xyz123`
      const { memos, error } = await api.searchMemos(uniqueString)

      expect(error).toBeUndefined()
      expect(memos).toEqual([])
    })

    it("should handle case-insensitive search", async () => {
      const { memos: upperCase } = await api.searchMemos("TEST")
      const { memos: lowerCase } = await api.searchMemos("test")

      expect(upperCase.length).toBe(lowerCase.length)
    })
  })

  describe("deleteMemo", () => {
    it("should delete a memo successfully", async () => {
      // First create a memo to delete
      const content = "Memo to be deleted"
      const createResult = await api.createMemo(content)
      expect(createResult.success).toBe(true)

      const memoName = createResult.data?.name
      expect(memoName).toBeDefined()

      // Delete the memo
      const deleteResult = await api.deleteMemo(memoName!)
      expect(deleteResult.success).toBe(true)
    })

    it("should handle deleting non-existent memo", async () => {
      const result = await api.deleteMemo("memos/nonexistent123")

      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    })
  })

  describe("buildAttachmentUrl", () => {
    it("should build URL from attachment name and filename", () => {
      const attachment = {
        name: "attachment123",
        filename: "test file.png",
        type: "image/png",
        size: 1024
      }

      const url = api.buildAttachmentUrl(attachment)

      expect(url).toBe(`${host}/file/attachment123/test%20file.png`)
    })

    it("should use external link if available", () => {
      const attachment = {
        name: "attachment123",
        filename: "test.png",
        type: "image/png",
        size: 1024,
        externalLink: "https://example.com/image.png"
      }

      const url = api.buildAttachmentUrl(attachment)

      expect(url).toBe("https://example.com/image.png")
    })

    it("should return empty string for incomplete attachment", () => {
      const attachment = {
        name: "",
        filename: "test.png",
        type: "image/png",
        size: 1024
      }

      const url = api.buildAttachmentUrl(attachment)

      expect(url).toBe("")
    })
  })
})
