import { invokeCommand, isTauriRuntime, selectWikiExportPath } from "../lib/tauri";
import type {
  CreateWikiPageRequest,
  MoveWikiPageRequest,
  SaveWikiAttachmentRequest,
  UpdateWikiPageRequest,
  WikiAttachment,
  WikiExportInfo,
  WikiPage,
  WikiPageReference,
  WikiSearchHit,
  WikiTree,
} from "../types";

export async function fetchWikiTree(): Promise<WikiTree> {
  if (!isTauriRuntime()) {
    return { roots: [] };
  }
  return invokeCommand("list_wiki_tree");
}

export async function fetchWikiPage(pageId: string): Promise<WikiPage> {
  return invokeCommand("get_wiki_page", { pageId });
}

export async function createWikiPage(
  request: CreateWikiPageRequest,
): Promise<WikiPage> {
  return invokeCommand("create_wiki_page", { request });
}

export async function updateWikiPage(
  request: UpdateWikiPageRequest,
): Promise<WikiPage> {
  return invokeCommand("update_wiki_page", { request });
}

export async function deleteWikiPage(pageId: string): Promise<void> {
  await invokeCommand("delete_wiki_page", { pageId });
}

export async function moveWikiPage(
  request: MoveWikiPageRequest,
): Promise<WikiTree> {
  return invokeCommand("move_wiki_page", { request });
}

export async function searchWiki(query: string, limit = 20): Promise<WikiSearchHit[]> {
  if (!query.trim()) {
    return [];
  }
  return invokeCommand("search_wiki", { query, limit });
}

export async function listWikiPagesForConnection(
  connectionId: string,
): Promise<WikiPageReference[]> {
  if (!isTauriRuntime()) {
    return [];
  }
  return invokeCommand("list_wiki_pages_for_connection", { connectionId });
}

export async function saveWikiAttachment(
  request: SaveWikiAttachmentRequest,
): Promise<WikiAttachment> {
  return invokeCommand("save_wiki_attachment", { request });
}

export async function deleteWikiAttachment(attachmentId: string): Promise<void> {
  await invokeCommand("delete_wiki_attachment", {
    request: { attachmentId },
  });
}

export async function exportWikiToZip(): Promise<WikiExportInfo | null> {
  const destination = await selectWikiExportPath("kkterm-wiki.zip");
  if (!destination) {
    return null;
  }
  return invokeCommand("export_wiki_zip", { destPath: destination });
}

export async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const value = reader.result;
      if (typeof value !== "string") {
        reject(new Error("unexpected reader result"));
        return;
      }
      const commaIndex = value.indexOf(",");
      resolve(commaIndex >= 0 ? value.slice(commaIndex + 1) : value);
    };
    reader.onerror = () => reject(reader.error ?? new Error("failed to read file"));
    reader.readAsDataURL(file);
  });
}
