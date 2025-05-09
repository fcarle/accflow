// Define the ClientFile model
export interface ClientFile {
  id: string;
  fileName: string;
  filePath: string;
  fileUrl: string;
  fileType: string;
  fileSize: number;
  uploadedAt: string;
  clientId: string;
}

// Define the model for a simplified client file record
export interface ClientFileRecord {
  fileName: string;
  fileUrl: string;
} 