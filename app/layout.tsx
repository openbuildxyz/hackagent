import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import HtmlLangSync from "@/components/HtmlLangSync";

export const metadata: Metadata = {
  title: "HackAgent — AI-native Hackathon Review Platform",
  description: "Multi-model AI review engine that turns days of hackathon judging into hours. Used by OpenBuild, Monad, and top web3/AI communities.",
  keywords: ["hackathon", "AI review", "agent", "OpenBuild", "Monad", "黑客松", "AI 评审"],
  openGraph: {
    title: "HackAgent — AI-native Hackathon Review",
    description: "Seven models in parallel. Human judges on disagreements. Reports in minutes.",
    url: "https://hackathon.xyz",
    siteName: "HackAgent",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "HackAgent — AI-native Hackathon Review",
    description: "Seven models in parallel. Human judges on disagreements. Reports in minutes.",
  },
};

const themeBootstrap = `
(function(){try{
  var s = localStorage.getItem('theme');
  var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  var dark = s ? s === 'dark' : false; // default light
  if (dark) document.documentElement.classList.add('dark');
}catch(e){}})();
(function(){try{
  function readCookie(name){
    var m = document.cookie.match('(?:^|; )' + name + '=([^;]*)');
    return m ? decodeURIComponent(m[1]) : null;
  }
  var c = readCookie('hackagent-locale');
  var l = c || localStorage.getItem('hackagent-locale');
  var loc = l === 'en' ? 'en' : 'zh';
  document.documentElement.lang = loc;
  document.documentElement.setAttribute('data-locale', loc);
}catch(e){}})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body className="antialiased font-sans">
        <HtmlLangSync />
        {children}
        <Toaster />
      </body>
    </html>
  );
}
