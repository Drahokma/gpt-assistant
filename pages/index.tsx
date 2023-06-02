import React, { useCallback, useState, useEffect, useRef } from "react"
import Head from "next/head"
import Link from "next/link"
import { useCredentialsCookie } from "@/context/credentials-context"
import { useToast } from "@/hooks/use-toast"
import { Bot, Loader2, Send, CheckCircle, User } from "lucide-react"

import { siteConfig } from "@/config/site"
import { cn } from "@/lib/utils"
import { Layout } from "@/components/layout"
import { Button } from "@/components/ui/button"

const DEFAULT_QUESTION = ""
const INITIAL_MESSAGE = {
  from: "bot",
  content:
    "You can consider me as your knowledge base, ask about the files stored in the database. You can come back anytime and ask questions about them across multiple files.",
}

export default function IndexPage() {
  const [documents, setDocuments] = useState([])
  const [selectedDocuments, setSelectedDocuments] = useState([])
  const [question, setQuestion] = useState(DEFAULT_QUESTION)
  const [isAsking, setIsAsking] = useState(false)
  const [chatHistory, setChatHistory] = useState([])
  const { cookieValue } = useCredentialsCookie()
  const [selectAll, setSelectAll] = useState(false)

  //hooks definition
  const chatContainerRef = useRef(null)
  const { toast } = useToast()

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [chatHistory]);

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

  const handleDocumentToggle = (document) => {
    if (selectedDocuments.includes(document)) {
      setSelectedDocuments(selectedDocuments.filter((doc) => doc !== document))
    } else {
      setSelectedDocuments([...selectedDocuments, document])
    }
    console.log(selectedDocuments)
  }

  const handleQueryChange = (e) => {
    setQuestion(e.target.value)
  }

  const handleSubmit = useCallback(async () => {
    setIsAsking(true)
    setQuestion("")
    setChatHistory([
      ...chatHistory,
      {
        from: "user",
        content: question,
      },
    ])

    const response = await fetch("/api/chat", {
      body: JSON.stringify({
        credentials: cookieValue,
        question,
        chatHistory: chatHistory.reduce((prev, curr) => {
          prev += curr.content
          return prev
        }, ""),
        selectedDocuments, // Added this line to include the selected documents in the request body
      }),
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
    })
    const answer = await response.json()

    if (answer.output) {
      setChatHistory((currentChatHistory) => [
        ...currentChatHistory,
        {
          from: "bot",
          content: answer.output,
        },
      ])

      setIsAsking(false)
    } else {
      setIsAsking(false)
      toast({
        title: "Something went wrong.",
        description: answer.error,
      })
    }
  }, [question, chatHistory, cookieValue, toast, selectedDocuments]) // Add selectedDocuments to the dependency array

  const handleKeyDown = useCallback(
    async (event) => {
      if (event.key === "Enter") {
        handleSubmit()
      }
    },
    [handleSubmit]
  )

  const handleSelectAll = () => {
    if (selectAll) {
      setSelectedDocuments([]);
    } else {
      setSelectedDocuments(documents);
    }
    setSelectAll(!selectAll);
  };

  const handleVectorize = useCallback(async () => {
    try {
      const response = await fetch("/api/create-vectorstore", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          credentials: cookieValue,
          selectedDocuments }),
      });

      if (response.ok) {
        toast({
          title: "Vectorization complete.",
          description: "Selected documents have been vectorized.",
        });
      } else {
        const error = await response.json();
        throw new Error(error.error || "Unknown error.");
      }
    } catch (error) {
      console.error("Error vectorizing documents:", error);
      toast({
        title: "Something went wrong.",
        description: error.message || "Unknown error.",
      });
    }
  }, [selectedDocuments, toast]);

  return (
    <Layout>
      <Head>
        <title>{siteConfig.name}</title>
        <meta name="description" content={siteConfig.description} />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <section className="container flex flex-col justify-items-stretch gap-6 pt-6 pb-8 sm:flex-row md:py-10">
        <div className="min-w-1/5 flex flex-col items-start gap-2">
          <h2 className="mt-10 scroll-m-20 pb-2 text-2xl font-semibold tracking-tight transition-colors first:mt-0">
            Dokumenty
          </h2>
          <div className="min-w-full rounded-md border border-slate-200 p-0 dark:border-slate-700">
            <ul className="p-4">
              {Array.isArray(documents) &&
                documents.map((document, index) => (
                  <li key={index}>
                  <input
                    type="checkbox"
                    checked={selectedDocuments.includes(document)}
                    onChange={() => handleDocumentToggle(document)}
                  />
                  <span className="ml-2">{document.filename}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex items-center">
            <Button className="mr-2"
              onClick={handleSelectAll}>
              {selectAll ? "Deselect All" : "Select All"}
            </Button>
            {/*<Button*/}
            {/*  disabled={*/}
            {/*    !selectedDocuments.length ||*/}
            {/*    !cookieValue.openaiApiKey*/}
            {/*  }*/}
            {/*  className="mr-2"*/}
            {/*  onClick={handleVectorize}*/}
            {/*>*/}
            {/*  <CheckCircle className="mr-2 h-4 w-4" />*/}
            {/*  Vectorize*/}
            {/*</Button>*/}
          </div>
        </div>

        <div className="flex grow flex-col items-start gap-2">
          <h2 className="mt-10 scroll-m-20 pb-2 text-2xl font-semibold tracking-tight transition-colors first:mt-0">
            Zeptejte se na otázku ohledně dokumentů.
          </h2>

          <div className="w-full">
            <div
              ref={chatContainerRef}
              className="scrollbar-thumb-blue scrollbar-thumb-rounded
              scrollbar-track-blue-lighter scrollbar-w-2 scrolling-touch flex min-h-[300px]
              max-h-[300px] flex-col space-y-4 overflow-y-auto rounded border border-gray-400 p-4">
              {[INITIAL_MESSAGE, ...chatHistory].map((chat, index) => {
                return (
                  <div className="chat-message" key={index}>
                    <div
                      className={cn(
                        "flex",
                        "items-end",
                        chat.from === "bot" && "justify-end"
                      )}
                    >
                      <div
                        className={cn(
                          "order-2 mx-2 flex max-w-xs flex-col items-start space-y-2 text-xs",
                          chat.from === "bot" && "order-1"
                        )}
                      >
                        <div>
                          <span
                            className={cn(
                              "inline-block rounded-lg bg-gray-300 px-4 py-2 text-gray-600",
                              chat.from === "user" &&
                                "rounded-bl-none bg-gray-300 text-gray-600",
                              chat.from === "bot" &&
                                "rounded-br-none bg-blue-600 text-white"
                            )}
                          >
                            {chat.content}
                          </span>
                        </div>
                      </div>
                      {chat.from === "user" ? (
                        <User className="order-1 h-4 w-4" />
                      ) : (
                        <Bot className="order-1 h-4 w-4" />
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="mb-2 pt-4 sm:mb-0">
              <div className="relative flex">
                <input
                  type="text"
                  value={question}
                  placeholder={DEFAULT_QUESTION}
                  onChange={handleQueryChange}
                  className="mr-2 w-full rounded-md border border-gray-400 pl-2 text-gray-700 focus:border-gray-500 focus:bg-white focus:outline-none"
                  onKeyDown={handleKeyDown}
                />
                <div className="items-center sm:flex">
                  <Button
                    disabled={
                      isAsking
                    }
                    onClick={handleSubmit}
                  >
                    {!isAsking ? (
                      <Send className="h-4 w-4" />
                    ) : (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </Layout>
  )
}
