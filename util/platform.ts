export type OSPlatform = 'win32' | 'darwin' | 'linux' | 'freebsd' | 'openbsd' | 'sunos' | 'aix' | string

const _platform: OSPlatform = typeof process !== 'undefined' ? process.platform : 'browser'

export const getPlatform = (): OSPlatform => _platform

export const isWindows = (): boolean => _platform === 'win32'
export const isMac = (): boolean => _platform === 'darwin'
export const isLinux = (): boolean => _platform === 'linux'

export const getDefaultShell = (): string => {
  if (isWindows()) {
    return typeof process !== 'undefined' ? process.env.COMSPEC || 'cmd.exe' : 'cmd.exe'
  }

  return typeof process !== 'undefined' ? process.env.SHELL || '/bin/sh' : '/bin/sh'
}
