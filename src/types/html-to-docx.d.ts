declare module 'html-to-docx' {
    export default function HTMLtoDOCX(
        html: string,
        headerHTML?: string | null,
        documentOptions?: Record<string, unknown>,
        footerHTML?: string | null
    ): Promise<Buffer>;
}
