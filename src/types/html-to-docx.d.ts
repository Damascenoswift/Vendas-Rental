declare module 'html-to-docx' {
    export default function HTMLtoDOCX(
        html: string,
        headerHTML?: string | null,
        documentOptions?: any,
        footerHTML?: string | null
    ): Promise<Buffer>;
}
