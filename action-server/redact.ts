export function redactSecrets(text: string, secrets: Record<string, string>): string {
  for (const value of Object.values(secrets)
    .filter(Boolean)
    .sort((a, b) => b.length - a.length))
    text = text.split(value).join('[REDACTED]')
  return text
}
