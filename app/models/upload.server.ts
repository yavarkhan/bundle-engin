// CREATE this file at app/models/upload.server.ts
// Uploads an image from the offer editor into Shopify Files (CDN) and
// returns its public URL. Requires the `write_files` access scope.
//
// Flow: stagedUploadsCreate -> POST file to staged target -> fileCreate
//       -> poll until processed -> return CDN url.

type AdminClient = {
  graphql: (query: string, options?: { variables?: Record<string, unknown> }) => Promise<Response>;
};

async function gql<T = any>(
  admin: AdminClient,
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const res = await admin.graphql(query, variables ? { variables } : undefined);
  const body = (await res.json()) as { data?: T; errors?: { message: string }[] };
  if (body.errors?.length) throw new Error(body.errors.map((e) => e.message).join("; "));
  return body.data as T;
}

export async function uploadImage(admin: AdminClient, file: File): Promise<string> {
  if (!file || file.size === 0) throw new Error("No file received.");
  if (file.size > 5 * 1024 * 1024) throw new Error("Image must be under 5 MB.");
  if (!file.type.startsWith("image/")) throw new Error("Only image files are allowed.");

  // 1. Ask Shopify for a staged upload target
  const staged = await gql(
    admin,
    `#graphql
    mutation StagedUpload($input: [StagedUploadInput!]!) {
      stagedUploadsCreate(input: $input) {
        stagedTargets { url resourceUrl parameters { name value } }
        userErrors { field message }
      }
    }`,
    {
      input: [
        {
          resource: "FILE",
          filename: file.name || "bundle-tier.png",
          mimeType: file.type,
          httpMethod: "POST",
        },
      ],
    },
  );
  const errs1 = staged.stagedUploadsCreate.userErrors;
  if (errs1?.length) throw new Error(errs1.map((e: any) => e.message).join("; "));
  const target = staged.stagedUploadsCreate.stagedTargets[0];

  // 2. POST the bytes to the staged target
  const formData = new FormData();
  for (const p of target.parameters) formData.append(p.name, p.value);
  formData.append("file", file);
  const uploadRes = await fetch(target.url, { method: "POST", body: formData });
  if (!uploadRes.ok) throw new Error(`Upload failed (${uploadRes.status}).`);

  // 3. Register it as a Shopify File
  const created = await gql(
    admin,
    `#graphql
    mutation FileCreate($files: [FileCreateInput!]!) {
      fileCreate(files: $files) {
        files { id fileStatus }
        userErrors { field message }
      }
    }`,
    { files: [{ originalSource: target.resourceUrl, contentType: "IMAGE" }] },
  );
  const errs2 = created.fileCreate.userErrors;
  if (errs2?.length) throw new Error(errs2.map((e: any) => e.message).join("; "));
  const fileId = created.fileCreate.files[0].id as string;

  // 4. Poll until processed, then return the CDN url
  for (let attempt = 0; attempt < 12; attempt++) {
    await new Promise((r) => setTimeout(r, 1000));
    const result = await gql(
      admin,
      `#graphql
      query FileStatus($id: ID!) {
        node(id: $id) {
          ... on MediaImage { fileStatus image { url } }
        }
      }`,
      { id: fileId },
    );
    const node = result.node;
    if (node?.fileStatus === "READY" && node.image?.url) return node.image.url as string;
    if (node?.fileStatus === "FAILED") throw new Error("Shopify could not process this image.");
  }
  throw new Error("Image is still processing — try saving again in a few seconds.");
}
