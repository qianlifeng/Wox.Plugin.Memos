import { Context, Plugin, PluginInitParams, PublicAPI, Query, Result, WoxImage, ActionContext, PluginSettingValueTextBox, FormActionContext } from "@wox-launcher/wox-plugin"
import { format } from "util"
import { MemosAPI, Memo } from "./api"
import { startProxyServer, getProxyPort, stopProxyServer } from "./proxy"

let api: PublicAPI
let memosApi: MemosAPI | null = null

const ICON: WoxImage = {
  ImageType: "relative",
  ImageData: "images/app.png"
}

/**
 * Get translated text with formatting
 * For static text, use "i18n:key" prefix in Title/SubTitle/Name fields
 */
async function tf(ctx: Context, key: string, ...args: unknown[]): Promise<string> {
  const translation = await api.GetTranslation(ctx, key)
  return format(translation, ...args)
}

/**
 * Extract hashtags from memo content
 * @param content Memo content
 * @returns Array of tags (without # prefix)
 */
function extractTags(content: string): string[] {
  const tagRegex = /#[\w\u4e00-\u9fa5]+/g
  const matches = content.match(tagRegex)
  if (!matches) return []

  // Remove # prefix and deduplicate
  return Array.from(new Set(matches.map(tag => tag.substring(1))))
}

/**
 * Remove hashtags from content
 * @param content Memo content
 * @returns Content without hashtags
 */
function removeTags(content: string): string {
  return content
    .replace(/#[\w\u4e00-\u9fa5]+/g, "") // Remove hashtags
    .replace(/\s+/g, " ") // Replace multiple spaces with single space
    .trim()
}

async function getCreateResult(ctx: Context, content: string): Promise<Result[]> {
  return [
    {
      Title: await tf(ctx, "create_title", content),
      SubTitle: "i18n:create_subtitle",
      Icon: ICON,
      Score: 100,
      Actions: [
        {
          Id: "create-memo",
          Name: "i18n:action_create",
          Action: async (actionCtx: Context) => {
            if (!memosApi) return
            const result = await memosApi.createMemo(content)
            if (result.success) {
              await api.Notify(actionCtx, (await tf(actionCtx, "action_create")) + " ✓")
              await api.RefreshQuery(actionCtx, { PreserveSelectedIndex: false })
            } else {
              await api.Notify(actionCtx, result.error || "Error")
            }
          }
        }
      ]
    }
  ]
}

async function getListResults(ctx: Context, host: string): Promise<Result[]> {
  if (!memosApi) return []

  const { memos, error } = await memosApi.listMemos(1, 20)

  if (error) {
    return [
      {
        Title: "i18n:loading_failed",
        SubTitle: error,
        Icon: { ImageType: "emoji", ImageData: "⚠️" },
        Score: 100,
        Actions: []
      }
    ]
  }

  if (memos.length === 0) {
    return [
      {
        Title: "i18n:no_memos",
        SubTitle: "i18n:no_memos_subtitle",
        Icon: ICON,
        Score: 100,
        Actions: []
      }
    ]
  }

  return memos.map((memo, index) => buildMemoResult(ctx, memo, index, host))
}

async function getSearchResults(ctx: Context, query: string, host: string): Promise<Result[]> {
  if (!memosApi) return []

  const { memos, error } = await memosApi.searchMemos(query)

  if (error) {
    return [
      {
        Title: "i18n:search_failed",
        SubTitle: error,
        Icon: { ImageType: "emoji", ImageData: "⚠️" },
        Score: 100,
        Actions: []
      }
    ]
  }

  if (memos.length === 0) {
    return [
      {
        Title: await tf(ctx, "create_title", query),
        Icon: ICON,
        Actions: [
          {
            Id: "create",
            Name: "i18n:action_create",
            IsDefault: true,
            Action: async (actionCtx: Context) => {
              if (!memosApi) return
              const result = await memosApi.createMemo(query)
              if (result.success) {
                await api.Notify(actionCtx, (await tf(actionCtx, "action_create")) + " ✓")
                await api.RefreshQuery(actionCtx, { PreserveSelectedIndex: false })
              } else {
                await api.Notify(actionCtx, result.error || "Error")
              }
            }
          }
        ]
      }
    ]
  }

  return memos.map((memo, index) => buildMemoResult(ctx, memo, index, host))
}

function buildMemoResult(ctx: Context, memo: Memo, index: number, host: string): Result {
  const timeStr = formatMemoTime(memo)
  const contentWithoutTags = removeTags(memo.content)
  const title = contentWithoutTags.length > 20 ? contentWithoutTags.substring(0, 17) + "..." : contentWithoutTags
  const tags = extractTags(memo.content)
  const attachmentCount = memo.attachments?.length || 0

  // Build preview properties with i18n keys
  const properties: Record<string, string> = {}

  if (tags.length > 0) {
    properties["i18n:property_tags"] = tags.join(", ")
  }

  if (timeStr) {
    properties["i18n:property_created"] = timeStr
  }

  if (attachmentCount > 0) {
    properties["i18n:property_attachments"] = `${attachmentCount}`
  }

  properties["i18n:property_length"] = `${contentWithoutTags.length} chars`

  return {
    Title: title,
    SubTitle: "",
    Icon: ICON,
    Score: 100 - index,
    Tails: [{ Type: "text", Text: timeStr }],
    Preview: {
      PreviewType: "markdown",
      PreviewData: formatPreview(memo),
      PreviewProperties: properties
    },
    Actions: [
      {
        Name: "i18n:action_open",
        Icon: { ImageType: "emoji", ImageData: "🌐" },
        ContextData: {
          memoName: memo.name
        },
        Action: async (actionCtx: Context, actionContext: ActionContext) => {
          const memoName = actionContext.ContextData["memoName"]
          if (!memoName) return

          const { default: open } = await import("open")
          await open(`${host}/${memoName}`)
        }
      },
      {
        Name: "i18n:action_copy",
        Icon: { ImageType: "emoji", ImageData: "📋" },
        Action: async (actionCtx: Context) => {
          await api.Copy(actionCtx, { text: memo.content, type: "text" })
        }
      },
      {
        Name: "i18n:action_edit",
        Icon: { ImageType: "emoji", ImageData: "✏️" },
        Type: "form",
        Form: [
          {
            Type: "textbox",
            Value: {
              Key: "content",
              Label: "i18n:edit_content_label",
              MaxLines: 5,
              DefaultValue: memo.content,
              Tooltip: "i18n:edit_content_tooltip"
            } as PluginSettingValueTextBox,
            DisabledInPlatforms: [],
            IsPlatformSpecific: false
          }
        ],
        OnSubmit: async (actionCtx: Context, formActionContext: FormActionContext) => {
          if (!memosApi) return
          const memoName = memo.name
          const newContent = formActionContext.Values["content"]

          if (!newContent || newContent === memo.content) {
            return
          }

          const result = await memosApi.updateMemo(memoName, newContent)
          if (result.success) {
            await api.Notify(actionCtx, (await tf(actionCtx, "action_edit")) + " ✓")
            await api.RefreshQuery(actionCtx, { PreserveSelectedIndex: true })
          } else {
            await api.Notify(actionCtx, result.error || "Update failed")
          }
        }
      },
      {
        Name: "i18n:action_delete",
        Icon: { ImageType: "emoji", ImageData: "🗑️" },
        ContextData: {
          memoName: memo.name
        },
        PreventHideAfterAction: true,
        Action: async (actionCtx: Context, actionContext: ActionContext) => {
          if (!memosApi) return
          const memoName = actionContext.ContextData["memoName"]
          if (!memoName) return

          const result = await memosApi.deleteMemo(memoName)
          if (result.success) {
            await api.Notify(actionCtx, (await tf(actionCtx, "action_delete")) + " ✓")
            await api.RefreshQuery(actionCtx, { PreserveSelectedIndex: true })
          } else {
            await api.Log(actionCtx, "Error", result.error || "Delete failed")
          }
        }
      }
    ]
  }
}

function formatMemoTime(memo: Memo): string {
  const createdTime = memo.createTime || memo.createdTs || ""
  if (!createdTime) return ""

  try {
    const dt = new Date(createdTime.replace("Z", "+00:00"))
    return dt.toLocaleString("en-US", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    })
  } catch {
    return ""
  }
}

function formatPreview(memo: Memo): string {
  const content = removeTags(memo.content || "")
  const attachments = memo.attachments || []

  if (attachments.length === 0) {
    return content
  }

  const lines: string[] = []

  if (content) {
    lines.push(content)
    lines.push("")
  }

  for (const attachment of attachments) {
    const filename = attachment.filename || "Attachment"
    const fileType = attachment.type || ""
    const externalLink = attachment.externalLink || ""

    if (fileType.startsWith("image/")) {
      // Use proxy server for authenticated image access
      const imageUrl = externalLink || memosApi?.buildAttachmentUrl(attachment) || ""
      const proxyPort = getProxyPort()
      if (imageUrl && proxyPort) {
        const proxyUrl = `http://127.0.0.1:${proxyPort}/?url=${encodeURIComponent(imageUrl)}`
        lines.push(`![${filename}](${proxyUrl})`)
      }
    }

    lines.push("")
  }

  return lines.join("\n")
}

export const plugin: Plugin = {
  init: async (ctx: Context, initParams: PluginInitParams) => {
    api = initParams.API

    // Initialize API
    const host = (await api.GetSetting(ctx, "host")) as string
    const token = (await api.GetSetting(ctx, "token")) as string
    if (host && token) {
      memosApi = new MemosAPI(host, token)
    }

    // Start proxy server for image authentication
    try {
      const port = await startProxyServer(ctx, api, memosApi)
      await api.Log(ctx, "Info", `Proxy server started on port ${port}`)
    } catch (error) {
      await api.Log(ctx, "Error", `Failed to start proxy server: ${error}`)
    }

    // Listen for setting changes
    await api.OnSettingChanged(ctx, async (settingCtx: Context, key: string) => {
      // Reset API client when host or token changes
      if (key === "host" || key === "token") {
        const host = (await api.GetSetting(ctx, "host")) as string
        const token = (await api.GetSetting(ctx, "token")) as string
        if (host && token) {
          memosApi = new MemosAPI(host, token)
        }
        await api.Log(settingCtx, "Info", `Setting ${key} changed, API client will be reinitialized`)
      }
    })

    await api.OnUnload(ctx, async () => {
      stopProxyServer()
    })
  },

  query: async (ctx: Context, query: Query): Promise<Result[]> => {
    const host = (await api.GetSetting(ctx, "host")) as string
    const token = (await api.GetSetting(ctx, "token")) as string
    if (!host || !token) {
      return [
        {
          Title: "i18n:unconfigured_title",
          SubTitle: "i18n:unconfigured_subtitle",
          Icon: ICON,
          Actions: []
        }
      ]
    }

    if (query.Command === "create") {
      return await getCreateResult(ctx, query.Search)
    }

    if (!query.Search) {
      return await getListResults(ctx, host)
    }

    return await getSearchResults(ctx, query.Search, host)
  }
}
