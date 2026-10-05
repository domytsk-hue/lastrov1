import type { Category, CategoryId } from "../domain/types.ts";

export const CATEGORIES: Category[] = [
  {
    id: "alimentacao",
    name: "Alimentação",
    kind: "expense",
    icon: "utensils",
    color: "#12B886",
    keywords: ["almoço", "almoco", "jantar", "café", "cafe", "mercado", "supermercado", "ifood", "delivery", "padaria", "restaurante", "lanche", "pizza", "feira", "açougue", "comida", "hamburguer", "sushi", "bar"],
  },
  {
    id: "transporte",
    name: "Transporte",
    kind: "expense",
    icon: "car",
    color: "#3678F5",
    keywords: ["uber", "99", "gasolina", "combustível", "combustivel", "posto", "ônibus", "onibus", "metrô", "metro", "estacionamento", "pedágio", "pedagio", "taxi", "táxi", "etanol", "bilhete"],
  },
  {
    id: "moradia",
    name: "Moradia",
    kind: "expense",
    icon: "home",
    color: "#6E56F8",
    fixed: true,
    keywords: ["aluguel", "condomínio", "condominio", "luz", "energia", "água", "agua", "gás", "gas", "internet", "iptu", "casa", "faxina", "diarista"],
  },
  {
    id: "compras",
    name: "Compras",
    kind: "expense",
    icon: "shopping-bag",
    color: "#F08A4B",
    keywords: ["roupa", "tênis", "tenis", "amazon", "shopee", "mercado livre", "presente", "loja", "shopping", "eletrônico", "eletronico"],
  },
  {
    id: "saude",
    name: "Saúde",
    kind: "expense",
    icon: "heart-pulse",
    color: "#F0566B",
    keywords: ["farmácia", "farmacia", "remédio", "remedio", "médico", "medico", "consulta", "dentista", "exame", "academia", "plano de saúde", "terapia", "psicólogo"],
  },
  {
    id: "lazer",
    name: "Lazer",
    kind: "expense",
    icon: "ticket",
    color: "#E89A0C",
    keywords: ["cinema", "show", "ingresso", "viagem", "passeio", "festa", "balada", "jogo", "game", "teatro", "praia", "cerveja"],
  },
  {
    id: "assinaturas",
    name: "Assinaturas",
    kind: "expense",
    icon: "repeat",
    color: "#A35CF0",
    fixed: true,
    keywords: ["netflix", "spotify", "assinatura", "prime", "disney", "hbo", "youtube", "icloud", "chatgpt", "max", "globoplay", "deezer"],
  },
  {
    id: "educacao",
    name: "Educação",
    kind: "expense",
    icon: "graduation-cap",
    color: "#0EA5C6",
    fixed: true,
    keywords: ["curso", "livro", "faculdade", "escola", "inglês", "ingles", "aula", "mensalidade", "udemy", "alura"],
  },
  {
    id: "outros",
    name: "Outros",
    kind: "expense",
    icon: "circle-dashed",
    color: "#7890AF",
    keywords: [],
  },
  {
    id: "salario",
    name: "Salário",
    kind: "income",
    icon: "briefcase",
    color: "#0FB98F",
    keywords: ["salário", "salario", "pagamento", "holerite"],
  },
  {
    id: "freelance",
    name: "Freelance",
    kind: "income",
    icon: "sparkles",
    color: "#12B886",
    keywords: ["freela", "freelance", "projeto", "job", "cliente"],
  },
  {
    id: "rendimentos",
    name: "Rendimentos",
    kind: "income",
    icon: "trending-up",
    color: "#3678F5",
    keywords: ["rendimento", "dividendo", "dividendos", "juros", "cashback"],
  },
  {
    id: "outras-receitas",
    name: "Outras receitas",
    kind: "income",
    icon: "plus-circle",
    color: "#7890AF",
    keywords: ["reembolso", "pix recebido", "venda", "presente recebido"],
  },
];

const BY_ID = new Map(CATEGORIES.map((c) => [c.id, c]));

export function getCategory(id?: CategoryId): Category {
  return BY_ID.get(id ?? "outros") ?? BY_ID.get("outros")!;
}

export const EXPENSE_CATEGORIES = CATEGORIES.filter((c) => c.kind === "expense");
export const INCOME_CATEGORIES = CATEGORIES.filter((c) => c.kind === "income");
