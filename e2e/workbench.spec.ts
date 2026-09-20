import { expect, test, type Page } from "@playwright/test";

async function createCollection(page: Page, name: string) {
  await page.goto("/");
  await expect(page.getByLabel("Collection name")).toBeVisible();
  await page
    .getByRole("button", { name: "Create collection", exact: true })
    .click();
  await expect(page.getByLabel("Collection name")).toHaveValue(
    "Untitled collection",
  );
  await page.getByLabel("Collection name").fill(name);
  await page.getByLabel("Request name", { exact: true }).fill("Demo health");
  await page.getByRole("button", { name: "Save collection" }).click();
  await expect(page.getByRole("status")).toContainText("Collection saved");
}

test("save, reload, send, inspect checks, and reject malformed input", async ({
  page,
}) => {
  const name = `E2E persistence ${Date.now()}`;
  await createCollection(page, name);
  await page.reload();
  await page.locator(".collection-button").filter({ hasText: name }).click();
  await expect(page.getByLabel("Request name", { exact: true })).toHaveValue(
    "Demo health",
  );
  await page.getByRole("button", { name: "Send request" }).click();
  await expect(page.getByLabel("Response body", { exact: true })).toContainText(
    "RequestDock demo",
  );
  await expect(page.locator(".run-badge")).toHaveText("RUN PASSED");
  await page.getByRole("tab", { name: "Assertions" }).click();
  await page
    .getByLabel("Assertions", { exact: true })
    .fill('[{"type":"status","expected":201}]');
  await page.getByRole("button", { name: "Send request" }).click();
  await expect(page.locator(".run-badge")).toHaveText("RUN FAILED");
  await expect(page.locator(".check-row.fail")).toContainText("201");
  await page.getByLabel("Assertions", { exact: true }).fill("[broken json");
  await page.getByRole("button", { name: "Save collection" }).click();
  await expect(page.getByRole("alert")).toContainText("Assertions:");
});

test("import a real Postman collection and export a portable collection", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByLabel("Collection name")).toBeVisible();
  const name = `E2E import ${Date.now()}`;
  await page.getByLabel("Import collection file").setInputFiles({
    name: "postman.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        info: {
          name,
          schema:
            "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
        },
        item: [
          {
            name: "Imported health",
            request: {
              method: "GET",
              url: new URL("/api/demo", page.url()).toString(),
            },
          },
        ],
      }),
    ),
  });
  await expect(page.getByLabel("Collection name")).toHaveValue(name);
  await expect(page.getByLabel("Request name", { exact: true })).toHaveValue(
    "Imported health",
  );
  await page
    .getByRole("button", { name: "Run collection", exact: true })
    .click();
  await expect(page.getByLabel("Response body", { exact: true })).toContainText(
    "RequestDock demo",
  );
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export collection", exact: true })
    .click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.requestdock\.json$/);
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  const exported = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  expect(exported.name).toBe(name);
  expect(exported.requests[0].name).toBe("Imported health");
  exported.name = `${name} round-trip`;
  await page.getByLabel("Import collection file").setInputFiles({
    name: "exported.requestdock.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(exported)),
  });
  await expect(page.getByLabel("Collection name")).toHaveValue(exported.name);
  await expect(page.getByLabel("Request name", { exact: true })).toHaveValue(
    "Imported health",
  );
});

test("compare changed response bodies and ignore specific JSON fields", async ({
  page,
}) => {
  await createCollection(page, `E2E comparison ${Date.now()}`);
  const baselineResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/run") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Send request" }).click();
  const baseline = (await (await baselineResponse).json()) as { id: string };
  await expect(page.getByLabel("Response body", { exact: true })).toContainText(
    "RequestDock demo",
  );
  await page
    .getByLabel("Request URL")
    .fill(new URL("/api/health", page.url()).toString());
  await page.getByRole("button", { name: "Send request" }).click();
  await expect(page.getByLabel("Response body", { exact: true })).toHaveText(
    /"ok": true/,
  );
  await expect(
    page.getByLabel("Response body", { exact: true }),
  ).not.toContainText("RequestDock demo");
  await page.getByRole("tab", { name: "Compare", exact: true }).click();
  await page
    .getByLabel("Baseline run", { exact: true })
    .selectOption(baseline.id);
  await page.getByRole("button", { name: "Compare runs", exact: true }).click();
  await expect(page.locator(".diff-summary")).toContainText(
    "2 differences found",
  );
  await page.getByLabel("Ignore JSON paths").fill("service, version");
  await page.getByRole("button", { name: "Compare runs", exact: true }).click();
  await expect(page.locator(".diff-summary")).toContainText(
    "No differences found",
  );
  await page.getByRole("button", { name: /Run history/ }).click();
  await expect(
    page.getByRole("heading", { name: "Run history", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".history-item").first()).toContainText(
    "E2E comparison",
  );
});

test("mobile workspace stays within viewport and runs the demo", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await createCollection(page, `E2E mobile ${Date.now()}`);
  await page.getByRole("button", { name: "Send request" }).click();
  await expect(page.getByLabel("Response body", { exact: true })).toContainText(
    "RequestDock demo",
  );
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow).toBe(false);
});

test("invalid JSON remains editable across tabs and the final request cannot be deleted", async ({
  page,
}) => {
  await createCollection(page, `E2E editing ${Date.now()}`);
  await page.getByRole("tab", { name: "Assertions" }).click();
  await page.getByLabel("Assertions", { exact: true }).fill("[unfinished");
  await page.getByRole("tab", { name: "Body", exact: true }).click();
  await page.getByRole("tab", { name: "Assertions" }).click();
  await expect(page.getByLabel("Assertions", { exact: true })).toHaveValue(
    "[unfinished",
  );
  await page.getByRole("button", { name: "Save collection" }).click();
  await expect(page.getByRole("alert")).toContainText("Assertions:");
  await page
    .getByLabel("Assertions", { exact: true })
    .fill('[{"type":"status","expected":200}]');
  await page.getByRole("button", { name: "Save collection" }).click();
  await expect(page.getByRole("status")).toContainText("Collection saved");
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Delete request", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("at least one request");
  await expect(page.getByLabel("Request name", { exact: true })).toHaveValue(
    "Demo health",
  );
  await page.getByRole("button", { name: "Save collection" }).click();
  await expect(page.getByRole("status")).toContainText("Collection saved");
});
