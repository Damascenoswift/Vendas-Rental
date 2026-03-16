import { beforeAll, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/supabase", () => ({ supabase: {} }))

let MAX_TASK_ATTACHMENTS_PER_TASK: number
let validateTaskAttachment: (file: File | null | undefined) => string | null
let validateTaskAttachmentFiles: (
    filesInput: File[] | FileList | null | undefined,
    options?: { maxCount?: number }
) => string | null

let MAX_WORK_COMMENT_ATTACHMENTS_PER_COMMENT: number
let validateWorkCommentAttachment: (file: File | null | undefined) => string | null
let validateWorkCommentAttachmentFiles: (
    filesInput: File[] | FileList | null | undefined,
    options?: { maxCount?: number }
) => string | null

beforeAll(async () => {
    const taskAttachments = await import("../task-attachments")
    MAX_TASK_ATTACHMENTS_PER_TASK = taskAttachments.MAX_TASK_ATTACHMENTS_PER_TASK
    validateTaskAttachment = taskAttachments.validateTaskAttachment
    validateTaskAttachmentFiles = taskAttachments.validateTaskAttachmentFiles

    const workCommentAttachments = await import("../work-comment-attachments")
    MAX_WORK_COMMENT_ATTACHMENTS_PER_COMMENT = workCommentAttachments.MAX_WORK_COMMENT_ATTACHMENTS_PER_COMMENT
    validateWorkCommentAttachment = workCommentAttachments.validateWorkCommentAttachment
    validateWorkCommentAttachmentFiles = workCommentAttachments.validateWorkCommentAttachmentFiles
})

function createPdfFile(name: string, sizeBytes: number) {
    return new File([new Uint8Array(sizeBytes)], name, { type: "application/pdf" })
}

describe("attachment limits", () => {
    it("allows up to 8 task attachments", () => {
        const files = Array.from({ length: 8 }, (_, index) =>
            createPdfFile(`task-${index + 1}.pdf`, 1_024)
        )

        expect(MAX_TASK_ATTACHMENTS_PER_TASK).toBe(8)
        expect(validateTaskAttachmentFiles(files)).toBeNull()
    })

    it("rejects when task attachments exceed 8 files", () => {
        const files = Array.from({ length: 9 }, (_, index) =>
            createPdfFile(`task-${index + 1}.pdf`, 1_024)
        )

        expect(validateTaskAttachmentFiles(files)).toContain("8")
    })

    it("accepts a larger task PDF (20MB)", () => {
        const bigPdf = createPdfFile("task-big.pdf", 20 * 1024 * 1024)
        expect(validateTaskAttachment(bigPdf)).toBeNull()
    })

    it("allows up to 8 work comment attachments", () => {
        const files = Array.from({ length: 8 }, (_, index) =>
            createPdfFile(`work-${index + 1}.pdf`, 1_024)
        )

        expect(MAX_WORK_COMMENT_ATTACHMENTS_PER_COMMENT).toBe(8)
        expect(validateWorkCommentAttachmentFiles(files)).toBeNull()
    })

    it("rejects when work comment attachments exceed 8 files", () => {
        const files = Array.from({ length: 9 }, (_, index) =>
            createPdfFile(`work-${index + 1}.pdf`, 1_024)
        )

        expect(validateWorkCommentAttachmentFiles(files)).toContain("8")
    })

    it("accepts a larger work comment PDF (20MB)", () => {
        const bigPdf = createPdfFile("work-big.pdf", 20 * 1024 * 1024)
        expect(validateWorkCommentAttachment(bigPdf)).toBeNull()
    })
})
