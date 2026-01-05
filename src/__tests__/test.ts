import { Context, PublicAPI, Query, WoxImage } from "@wox-launcher/wox-plugin"
import { plugin } from "../index"

// Mock API
const mockAPI: Partial<PublicAPI> = {
  Log: jest.fn(),
  GetSetting: jest.fn(),
  GetTranslation: jest.fn(),
  OnSettingChanged: jest.fn(),
  Notify: jest.fn(),
  RefreshQuery: jest.fn(),
  Copy: jest.fn()
}

const createMockContext = (): Context => ({}) as Context

const createMockQuery = (overrides: Partial<Query> = {}): Query =>
  ({
    Id: "1",
    Env: {
      ActiveWindowTitle: "",
      ActiveWindowPid: 0,
      ActiveBrowserUrl: "",
      ActiveWindowIcon: {} as WoxImage
    },
    RawQuery: "memos",
    Selection: { Type: "text", Text: "", FilePaths: [] },
    Type: "input",
    Search: "",
    TriggerKeyword: "memos",
    Command: "",
    IsGlobalQuery: () => false,
    ...overrides
  }) as Query

describe("Memos Plugin", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(mockAPI.GetSetting as jest.Mock).mockResolvedValue("")
    ;(mockAPI.GetTranslation as jest.Mock).mockImplementation((ctx, key) => Promise.resolve(key))
  })

  describe("init", () => {
    it("should initialize successfully", async () => {
      const ctx = createMockContext()

      await plugin.init(ctx, {
        PluginDirectory: "",
        API: mockAPI as PublicAPI
      })

      expect(mockAPI.Log).toHaveBeenCalledWith(ctx, "Info", "Memos plugin initialized")
      expect(mockAPI.OnSettingChanged).toHaveBeenCalled()
    })
  })

  describe("query - unconfigured", () => {
    it("should show unconfigured message when host is missing", async () => {
      const ctx = createMockContext()
      ;(mockAPI.GetSetting as jest.Mock).mockResolvedValue("")

      await plugin.init(ctx, {
        PluginDirectory: "",
        API: mockAPI as PublicAPI
      })

      const query = createMockQuery()
      const results = await plugin.query(ctx, query)

      expect(results).toHaveLength(1)
      expect(results[0].Title).toBe("i18n:unconfigured_title")
      expect(results[0].SubTitle).toBe("i18n:unconfigured_subtitle")
    })
  })

  describe("query - empty query", () => {
    it("should show empty results when no search term", async () => {
      const ctx = createMockContext()
      ;(mockAPI.GetSetting as jest.Mock).mockResolvedValueOnce("https://demo.usememos.com").mockResolvedValueOnce("test-token")

      await plugin.init(ctx, {
        PluginDirectory: "",
        API: mockAPI as PublicAPI
      })

      const query = createMockQuery({ Search: "" })
      const results = await plugin.query(ctx, query)

      // Should show help/empty state results
      expect(results.length).toBeGreaterThan(0)
    })
  })

  describe("query - create command", () => {
    it("should show create result for create command with content", async () => {
      const ctx = createMockContext()
      ;(mockAPI.GetSetting as jest.Mock).mockResolvedValueOnce("https://demo.usememos.com").mockResolvedValueOnce("test-token")

      await plugin.init(ctx, {
        PluginDirectory: "",
        API: mockAPI as PublicAPI
      })

      const query = createMockQuery({
        Command: "create",
        Search: "Test memo content"
      })
      const results = await plugin.query(ctx, query)

      expect(results).toHaveLength(1)
      const firstResult = results[0]
      expect(firstResult).toBeDefined()
      if (firstResult && firstResult.Actions) {
        expect(firstResult.Actions.length).toBeGreaterThan(0)
      }
    })

    it("should show empty results for create command without content", async () => {
      const ctx = createMockContext()
      ;(mockAPI.GetSetting as jest.Mock).mockResolvedValueOnce("https://demo.usememos.com").mockResolvedValueOnce("test-token")

      await plugin.init(ctx, {
        PluginDirectory: "",
        API: mockAPI as PublicAPI
      })

      const query = createMockQuery({
        Command: "create",
        Search: ""
      })
      const results = await plugin.query(ctx, query)

      // Should show help results
      expect(results.length).toBeGreaterThan(0)
    })
  })
})
