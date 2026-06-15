// Resolve a /public asset against the app's base URL so it works both in local
// dev (base "/") and on GitHub Pages (base "/UTC/"). Always pass a bare name
// like asset('logo.png').
export const asset = (path: string) => `${import.meta.env.BASE_URL}${path.replace(/^\/+/, '')}`
