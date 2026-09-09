import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';
import { WEB_APP_MAX_WIDTH } from '../constants/webAppMaxWidth';

const gutter = '#E4E4E7';

const css = `
html, body, #root {
  height: 100%;
}
html, body {
  margin: 0;
  background-color: ${gutter};
}
body > [role="dialog"],
body > [aria-modal="true"] {
  left: max(0px, calc((100vw - ${WEB_APP_MAX_WIDTH}px) / 2)) !important;
  right: max(0px, calc((100vw - ${WEB_APP_MAX_WIDTH}px) / 2)) !important;
}
`;

/** Web document shell: gutter color + pin RN Modals to the app column. */
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{ __html: css }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
