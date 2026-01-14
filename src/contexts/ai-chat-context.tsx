"use client"

import React, { createContext, useContext, useState, ReactNode } from "react"

export type Message = {
    id: string
    role: "user" | "assistant" | "system"
    content: string
    timestamp: Date
}

interface AiChatContextType {
    isOpen: boolean
    toggleOpen: () => void
    messages: Message[]
    addMessage: (message: Omit<Message, "id" | "timestamp">) => void
    isLoading: boolean
    setIsLoading: (loading: boolean) => void
}

const AiChatContext = createContext<AiChatContextType | undefined>(undefined)

export function AiChatProvider({ children }: { children: ReactNode }) {
    const [isOpen, setIsOpen] = useState(false)
    const [isLoading, setIsLoading] = useState(false)
    const [messages, setMessages] = useState<Message[]>([
        {
            id: "welcome",
            role: "assistant",
            content: "Olá! Sou o Jarvis. Como posso ajudar você hoje?",
            timestamp: new Date()
        }
    ])

    const toggleOpen = () => setIsOpen((prev) => !prev)

    const addMessage = (message: Omit<Message, "id" | "timestamp">) => {
        const newMessage: Message = {
            ...message,
            id: Math.random().toString(36).substring(7),
            timestamp: new Date()
        }
        setMessages((prev) => [...prev, newMessage])
    }

    return (
        <AiChatContext.Provider value={{ isOpen, toggleOpen, messages, addMessage, isLoading, setIsLoading }}>
            {children}
        </AiChatContext.Provider>
    )
}

export function useAiChat() {
    const context = useContext(AiChatContext)
    if (context === undefined) {
        throw new Error("useAiChat must be used within an AiChatProvider")
    }
    return context
}
