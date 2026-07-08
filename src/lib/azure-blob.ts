import {
  BlobServiceClient,
  StorageSharedKeyCredential,
  generateBlobSASQueryParameters,
  BlobSASPermissions,
  ContainerClient,
} from "@azure/storage-blob";

const accountName = process.env.AZURE_STORAGE_ACCOUNT_NAME!;
const accountKey = process.env.AZURE_STORAGE_ACCOUNT_KEY!;
const containerName = process.env.AZURE_STORAGE_CONTAINER_FACTURAS ?? "facturas-documents";

function getServiceClient(): BlobServiceClient {
  const credential = new StorageSharedKeyCredential(accountName, accountKey);
  return new BlobServiceClient(
    `https://${accountName}.blob.core.windows.net`,
    credential
  );
}

export function getContainerClient(): ContainerClient {
  return getServiceClient().getContainerClient(containerName);
}

// Sube un archivo y retorna la URL pública (SAS con 1 hora de validez)
export async function uploadBlob(
  blobPath: string,
  data: Buffer,
  contentType: string
): Promise<{ blobPath: string; blobUrl: string }> {
  const containerClient = getContainerClient();
  const blockBlobClient = containerClient.getBlockBlobClient(blobPath);

  await blockBlobClient.uploadData(data, {
    blobHTTPHeaders: { blobContentType: contentType },
  });

  const url = await generateSasUrl(blobPath, 60);
  return { blobPath, blobUrl: url };
}

// Genera una URL SAS con tiempo de expiración en minutos
export async function generateSasUrl(
  blobPath: string,
  expiryMinutes = 60
): Promise<string> {
  const credential = new StorageSharedKeyCredential(accountName, accountKey);
  const containerClient = getContainerClient();
  const blobClient = containerClient.getBlobClient(blobPath);

  const expiresOn = new Date();
  expiresOn.setMinutes(expiresOn.getMinutes() + expiryMinutes);

  const sasParams = generateBlobSASQueryParameters(
    {
      containerName,
      blobName: blobPath,
      permissions: BlobSASPermissions.parse("r"),
      expiresOn,
    },
    credential
  );

  return `${blobClient.url}?${sasParams.toString()}`;
}

// Descarga un blob como Buffer
export async function downloadBlob(blobPath: string): Promise<Buffer> {
  const containerClient = getContainerClient();
  const blobClient = containerClient.getBlobClient(blobPath);
  const downloadResponse = await blobClient.download();
  const chunks: Buffer[] = [];

  for await (const chunk of downloadResponse.readableStreamBody as AsyncIterable<Buffer>) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

// Elimina un blob
export async function deleteBlob(blobPath: string): Promise<void> {
  const containerClient = getContainerClient();
  await containerClient.deleteBlob(blobPath);
}

// Lista blobs con un prefijo (carpeta)
export async function listBlobs(prefix: string) {
  const containerClient = getContainerClient();
  const blobs: { name: string; size: number; contentType: string }[] = [];

  for await (const blob of containerClient.listBlobsFlat({ prefix })) {
    blobs.push({
      name: blob.name,
      size: blob.properties.contentLength ?? 0,
      contentType: blob.properties.contentType ?? "application/octet-stream",
    });
  }
  return blobs;
}

// Inicializa el container si no existe
export async function ensureContainer(): Promise<void> {
  const containerClient = getContainerClient();
  await containerClient.createIfNotExists();
}
