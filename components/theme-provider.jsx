"use client"

import * as React from "react"
import { ThemeProvider as NextThemesProvider } from "next-themes"

export function ThemeProvider({
  children,
  attribute,
  className,
  defaultTheme,
  enableSystem,
  disableTransitionOnChange,
}) {
  return (
    <NextThemesProvider
      attribute={attribute}
      className={className}
      defaultTheme={defaultTheme}
      enableSystem={enableSystem}
      disableTransitionOnChange={disableTransitionOnChange}
    >
      {children}
    </NextThemesProvider>
  )
}
