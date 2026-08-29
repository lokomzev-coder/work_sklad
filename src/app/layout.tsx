import type { Metadata } from "next";
import { Montserrat, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const montserrat = Montserrat({
  variable: "--font-montserrat",
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500", "600", "700"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "EasyWork",
  description: "Сотрудники, клиенты, заказы и пароли — в одном месте",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ru"
      className={`${montserrat.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <TooltipProvider delay={200}>
            {children}
            <Toaster />
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
