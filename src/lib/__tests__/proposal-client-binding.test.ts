import { describe, expect, it } from "vitest"

import {
    buildEditProposalClientLinkPatch,
    validateProposalClientCreation,
} from "@/lib/proposal-client-binding"

describe("validateProposalClientCreation", () => {
    it("returns an error when no lead/contact is selected and name is empty", () => {
        const result = validateProposalClientCreation({
            selectedIndicacaoId: null,
            selectedContactId: null,
            manualFirstName: "",
        })

        expect(result).toEqual({
            title: "Cliente obrigatório",
            description: "Selecione um contato/indicação ou informe pelo menos o nome para criar o cliente.",
        })
    })

    it("allows creation with only manual first name", () => {
        const result = validateProposalClientCreation({
            selectedIndicacaoId: null,
            selectedContactId: null,
            manualFirstName: "João",
        })

        expect(result).toBeNull()
    })

    it("allows creation with selected contact even without phone", () => {
        const result = validateProposalClientCreation({
            selectedIndicacaoId: null,
            selectedContactId: "contact-1",
            manualFirstName: "",
        })

        expect(result).toBeNull()
    })
})

describe("buildEditProposalClientLinkPatch", () => {
    it("returns empty patch when link is unchanged", () => {
        const patch = buildEditProposalClientLinkPatch({
            initialClientId: "client-1",
            initialContactId: "contact-1",
            selectedIndicacaoId: "client-1",
            selectedContactId: "contact-1",
        })

        expect(patch).toEqual({})
    })

    it("updates client and clears contact when selecting another indication", () => {
        const patch = buildEditProposalClientLinkPatch({
            initialClientId: "client-1",
            initialContactId: "contact-1",
            selectedIndicacaoId: "client-2",
            selectedContactId: null,
        })

        expect(patch).toEqual({
            client_id: "client-2",
            contact_id: null,
        })
    })

    it("keeps current client while changing only contact", () => {
        const patch = buildEditProposalClientLinkPatch({
            initialClientId: "client-1",
            initialContactId: "contact-1",
            selectedIndicacaoId: null,
            selectedContactId: "contact-2",
        })

        expect(patch).toEqual({
            client_id: "client-1",
            contact_id: "contact-2",
        })
    })

    it("clears both links when nothing is selected", () => {
        const patch = buildEditProposalClientLinkPatch({
            initialClientId: "client-1",
            initialContactId: "contact-1",
            selectedIndicacaoId: null,
            selectedContactId: null,
        })

        expect(patch).toEqual({
            client_id: null,
            contact_id: null,
        })
    })
})
