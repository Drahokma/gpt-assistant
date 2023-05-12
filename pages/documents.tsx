import React, { useCallback, useEffect, useState } from "react";
import Head from "next/head";
import { useCredentialsCookie } from "@/context/credentials-context";
import { useToast } from "@/hooks/use-toast";
import { Bot, Loader2, Send, UploadCloud, User } from "lucide-react";
import { useDropzone } from "react-dropzone";
import { siteConfig } from "@/config/site";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";

const DEFAULT_GITHUB_URL =
  "https://git.homecredit.net/risk/scoring/-/blob/develop/README.md";

const DocumentsPage = () => {
  const [documents, setDocuments] = useState([]);
  const [files, setFiles] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const { cookieValue } = useCredentialsCookie();
  const { toast } = useToast();
  const [githubUrl, setGithubUrl] = useState("");

  useEffect(() => {
    fetchDocuments();
  }, []);

  const fetchDocuments = async () => {
    try {
      const response = await fetch("/api/documents");
      const data = await response.json();
      console.log("API response data:", data);
      setDocuments(data);
    } catch (error) {
      console.error("Error fetching documents:", error);
    }
  };

  const onDrop = useCallback((acceptedFiles) => {
    setFiles(acceptedFiles);
  }, []);

  const handleUpload = useCallback(async () => {
    const formData = new FormData();
    formData.append("openai-api-key", cookieValue.openaiApiKey);
    formData.append("pinecone-api-key", cookieValue.pineconeApiKey);
    formData.append("pinecone-environment", cookieValue.pineconeEnvironment);
    formData.append("pinecone-index", cookieValue.pineconeIndex);
    Array.from(files).forEach((file: File) => {
      formData.append(file.name, file);
    });

    setIsUploading(true);
    try {
      const response = await fetch("/api/ingest", {
        method: "post",
        body: formData,
      });
      const result = await response.json();
      if (result.error) {
        toast({
          title: "Something went wrong.",
          description: result.error,
        });
      } else {
        toast({
          title: "Upload success.",
        });
        fetchDocuments();
      }

      setIsUploading(false);
    } catch (e) {
      toast({
        title: "Something went wrong.",
      });
      setIsUploading(false);
    }
  }, [files, cookieValue, toast]);

  const handleGithubUrlChange = (e) => {
    setGithubUrl(e.target.value);
  };

  const handleGithubUpload = useCallback(async () => {
    setIsUploading(true);
    try {
      const response = await fetch("/api/github", {
        body: JSON.stringify({
          credentials: cookieValue,
          githubUrl,
        }),
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
      });
      const result = await response.json();
      if (result.error) {
        toast({
          title: "Something went wrong.",
          description: result.error,
        });
      } else {
        toast({
          title: "Upload success.",
        });
        fetchDocuments();
      }

      setIsUploading(false);
    } catch (e) {
      toast({
        title: "Something went wrong.",
      });
      setIsUploading(false);
    }
  }, [githubUrl, cookieValue, toast]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "application/pdf": [".pdf"],
      "text/plain": [".txt", ".md"],
    },
  });

  const handleDelete = async (documentId) => {
    try {
      const response = await fetch(`/api/documents/${documentId}`, {
        method: "DELETE",
      });
      const result = await response.json();
      if (result.error) {
        toast({
          title: "Something went wrong.",
          description: result.error,
        });
      } else {
        toast({
          title: "Delete success.",
        });
        fetchDocuments();
      }
    } catch (e) {
      toast({
        title: "Something went wrong.",
      });
    }
  };

  return (
    <Layout>
      <Head>
        <title>{siteConfig.name} - Documents</title>
        <meta name="description" content={siteConfig.description} />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <section className="container pt-6 pb-8 md:py-10">
        <div className="flex flex-col md:flex-row">
          <div className="w-full md:w-1/2">
            <h2 className="text-2xl font-semibold tracking-tight">
              Upload Documents
            </h2>
            <div
              className="min-w-full rounded-md border border-slate-200 p-0 dark:border-slate-700"
              {...getRootProps()}
            >
              <div className="flex min-h-[150px] cursor-pointer items-center justify-center p-10">
                <input {...getInputProps()} />

                {files ? (
                  <ul>
                    {files.map((file) => (
                      <li key={file.name}>* {file.name}</li>
                    ))}
                  </ul>
                ) : (
                  <>
                    {isDragActive ? (
                      <p>Drag files here ...</p>
                    ) : (
                      <p>
                        Drag files here (.pdf, .txt, .md), or click to select
                        files.
                      </p>
                    )}
                  </>
                )}
              </div>
            </div>

            <div className="self-start">
              <Button
                disabled={
                  !files ||
                  isUploading ||
                  !cookieValue.openaiApiKey
                }
                className="mt-2"
                onClick={handleUpload}
              >
                {!isUploading ? (
                  <UploadCloud className="mr-2 h-4 w-4" />
                ) : (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Upload
              </Button>
            </div>

            <h2 className="mt-6 text-2xl font-semibold tracking-tight">
              Uploaded Documents
            </h2>
            <ul className="mt-4">
              {Array.isArray(documents) &&
                documents.map((document, index) => (
                  <li key={index}>
                    {document.filename} -{" "}
                    {new Date(document.metadata.uploadDate).toLocaleString()}
                    <Button
                      className="ml-2"
                      variant="outline"
                      onClick={() => handleDelete(document._id.toString())}
                    >
                      Delete
                    </Button>
                  </li>
                ))}
            </ul>
          </div>
          <div className="w-full mt-6 md:w-1/2 md:mt-0">
            <h2 className="text-2xl font-semibold tracking-tight">
              Upload GitHub Pages
            </h2>
            <div className="my-2 w-full">
              <input
                type="text"
                value={githubUrl}
                placeholder={DEFAULT_GITHUB_URL}
                onChange={handleGithubUrlChange}
                className="w-full rounded-md border border-gray-400 p-2 text-gray-700 focus:border-gray-500 focus:bg-white focus:outline-none"
              />
            </div>

            <Button
              disabled={
                !githubUrl ||
                isUploading ||
                !cookieValue.openaiApiKey ||
                !cookieValue.pineconeEnvironment ||
                !cookieValue.pineconeIndex ||
                !cookieValue.pineconeApiKey
              }
              onClick={handleGithubUpload}
              className="mt-2"
            >
              {!isUploading ? (
                <UploadCloud className="mr-2 h-4 w-4" />
              ) : (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Upload
            </Button>
          </div>
        </div>
      </section>
    </Layout>
  )
}

export default DocumentsPage
