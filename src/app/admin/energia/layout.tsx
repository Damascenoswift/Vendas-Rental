import { EnergySidebar } from "@/components/energy/energy-sidebar"

export default function EnergyLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <div className="flex min-h-screen bg-background">
            <EnergySidebar />
            <main className="flex-1 p-8">
                {children}
            </main>
        </div>
    )
}
