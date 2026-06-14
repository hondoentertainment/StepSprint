import { Router } from "express";
import { generateOpenApiDocument } from "../openapi";

const router = Router();

// Generate the document once on first request and cache it. We re-use
// the cached value because the registry is static per process.
let cachedDocument: ReturnType<typeof generateOpenApiDocument> | null = null;
function getDocument() {
  if (!cachedDocument) {
    cachedDocument = generateOpenApiDocument();
  }
  return cachedDocument;
}

router.get("/openapi.json", (_req, res) => {
  res.json(getDocument());
});

const SWAGGER_UI_HTML = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>StepSprint API Docs</title>
    <link
      rel="stylesheet"
      href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui.css"
    />
    <style>
      html, body { margin: 0; padding: 0; background: #fafafa; }
      #swagger-ui { max-width: 1200px; margin: 0 auto; }
    </style>
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
    <script>
      window.addEventListener('load', function () {
        window.ui = SwaggerUIBundle({
          url: '/api/openapi.json',
          dom_id: '#swagger-ui',
          deepLinking: true,
        });
      });
    </script>
  </body>
</html>`;

router.get("/docs", (_req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(SWAGGER_UI_HTML);
});

export default router;
