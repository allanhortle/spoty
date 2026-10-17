declare module 'get-image-colors' {
    interface Color {
        hex(): string;
    }
    export default function getColors(
        source: string | Buffer,
        options?: {count?: number; type?: string}
    ): Promise<Color[]>;
}
