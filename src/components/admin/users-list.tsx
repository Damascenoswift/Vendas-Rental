"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { deleteUser, syncUsersFromAuth } from "@/app/actions/auth-admin"
import { Button } from "@/components/ui/button"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { useToast } from "@/hooks/use-toast"
import { Trash2, User } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { EditUserDialog } from "./edit-user-dialog"

interface UsersListProps {
    users: any[]
    supervisors?: any[]
}

export function UsersList({ users, supervisors = [] }: UsersListProps) {
    const { showToast } = useToast()
    const [isSyncing, setIsSyncing] = useState(false)
    const router = useRouter()

    const handleSync = async () => {
        setIsSyncing(true)
        try {
            const result = await syncUsersFromAuth()
            if (result.success) {
                showToast({
                    variant: "success",
                    title: "Sincronização concluída",
                    description: result.message,
                })
                router.refresh()
            } else {
                showToast({
                    variant: "error",
                    title: "Erro ao sincronizar",
                    description: result.message,
                })
            }
        } catch {
            showToast({
                variant: "error",
                title: "Erro inesperado",
                description: "Não foi possível sincronizar os usuários.",
            })
        } finally {
            setIsSyncing(false)
        }
    }

    return (
        <div className="rounded-md border">
            <div className="flex items-center justify-between border-b bg-muted/30 px-4 py-3">
                <div className="text-sm text-muted-foreground">
                    Sincronize usuários do Auth para garantir que todos apareçam na lista.
                </div>
                <Button size="sm" variant="outline" onClick={handleSync} disabled={isSyncing}>
                    {isSyncing ? "Sincronizando..." : "Sincronizar Auth"}
                </Button>
            </div>
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Nome</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Função</TableHead>
                        <TableHead>Vendas</TableHead>
                        <TableHead>Chat interno</TableHead>
                        <TableHead>Marcas</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {users.map((user) => (
                        <TableRow key={user.id}>
                            <TableCell className="font-medium">
                                <div className="flex items-center gap-2">
                                    <User className="h-4 w-4 text-muted-foreground" />
                                    {user.name || "Sem nome"}
                                </div>
                            </TableCell>
                            <TableCell>{user.email}</TableCell>
                            <TableCell>
                                <Badge variant="outline" className="capitalize">
                                    {user.role?.replace('_', ' ')}
                                </Badge>
                            </TableCell>
                            <TableCell>
                                <Badge variant={user.sales_access ? "success" : "secondary"}>
                                    {user.sales_access ? "Ativo" : "Inativo"}
                                </Badge>
                            </TableCell>
                            <TableCell>
                                <Badge variant={user.internal_chat_access ? "success" : "secondary"}>
                                    {user.internal_chat_access ? "Ativo" : "Inativo"}
                                </Badge>
                            </TableCell>
                            <TableCell>
                                <div className="flex gap-1">
                                    {user.allowed_brands?.map((brand: string) => (
                                        <Badge key={brand} variant="secondary" className="text-xs">
                                            {brand}
                                        </Badge>
                                    ))}
                                </div>
                            </TableCell>
                            <TableCell className="text-right">
                                <div className="flex justify-end gap-1">
                                    <EditUserDialog user={user} supervisors={supervisors} />
                                    <DeleteUserButton userId={user.id} userName={user.name || user.email} />
                                </div>
                            </TableCell>
                        </TableRow>
                    ))}
                    {users.length === 0 && (
                        <TableRow>
                            <TableCell colSpan={7} className="h-24 text-center">
                                Nenhum usuário encontrado.
                            </TableCell>
                        </TableRow>
                    )}
                </TableBody>
            </Table>
        </div>
    )
}

function DeleteUserButton({ userId, userName }: { userId: string, userName: string }) {
    const { showToast } = useToast()
    const [isDeleting, setIsDeleting] = useState(false)
    const router = useRouter()

    const handleDelete = async () => {
        setIsDeleting(true)
        try {
            const result = await deleteUser(userId)
            if (result.success) {
                showToast({
                    variant: "success",
                    title: "Usuário excluído",
                    description: result.message || "O usuário foi removido com sucesso.",
                })
                router.refresh()
            } else {
                showToast({
                    variant: "error",
                    title: "Erro ao excluir",
                    description: result.message,
                })
            }
        } catch {
            showToast({
                variant: "error",
                title: "Erro inesperado",
                description: "Ocorreu um erro ao tentar excluir.",
            })
        } finally {
            setIsDeleting(false)
        }
    }

    return (
        <AlertDialog>
            <AlertDialogTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-50">
                    <Trash2 className="h-4 w-4" />
                </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Excluir usuário?</AlertDialogTitle>
                    <AlertDialogDescription>
                        Tem certeza que deseja excluir <strong>{userName}</strong>? Esta ação não pode ser desfeita.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
                        {isDeleting ? "Excluindo..." : "Excluir"}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    )
}
