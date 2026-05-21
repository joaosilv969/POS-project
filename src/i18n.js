const SUPPORTED_LANGUAGES = [
  { value: "pt", code: "pt-PT", label: "Português" },
  { value: "en", code: "en-GB", label: "English" },
];

const EN_TRANSLATIONS = {
  "Abrir menu": "Open menu",
  "Administrador": "Administrator",
  "Adicione produtos antes de finalizar.": "Add products before finishing.",
  "Adicione produtos para começar a conta.": "Add products to start the table order.",
  "Adicione produtos para iniciar a venda.": "Add products to start the sale.",
  "A mesa não tem produtos para fechar.": "The table has no products to close.",
  "A password deve ter pelo menos 6 caracteres.": "The password must be at least 6 characters long.",
  "A venda indicada não existe.": "The selected sale does not exist.",
  "A venda já não está em estado concluído.": "The sale is no longer in completed status.",
  "Aberta por": "Opened by",
  "Apenas Bar": "Bar only",
  "Aplicar": "Apply",
  "Ative o JavaScript no browser para usar o ponto de venda.": "Enable JavaScript in your browser to use the point of sale.",
  "Bar": "Bar",
  "Balcão": "Counter",
  "Cancelar esta mesa? A conta aberta será fechada sem venda.": "Cancel this table? The open order will be closed without a sale.",
  "Cancelar mesa": "Cancel table",
  "Categorias": "Categories",
  "Categorias Bar": "Bar categories",
  "Categorias existentes": "Existing categories",
  "Categorias Merchandising": "Merchandising categories",
  "Cotas": "Membership dues",
  "Clube": "Club",
  "Configuração": "Settings",
  "Configuração atualizada.": "Settings updated.",
  "Conta da mesa": "Table order",
  "Conta de mesa não encontrada.": "Table order not found.",
  "Credenciais inválidas.": "Invalid credentials.",
  "Dashboard": "Dashboard",
  "Dia": "Day",
  "Dinheiro": "Cash",
  "Editar sócio": "Edit member",
  "Editar utilizador": "Edit user",
  "Email ou nome de utilizador": "Email or username",
  "Entre com utilizador e password ou, em alternativa, apenas com PIN.": "Sign in with username and password or, alternatively, PIN only.",
  "Entre para gerir vendas, stock e produtos.": "Sign in to manage sales, stock, and products.",
  "Entrar": "Sign in",
  "Erro ao carregar teclado.": "Failed to load keyboard.",
  "Esse PIN de login já está a ser usado por outro utilizador.": "That login PIN is already being used by another user.",
  "Escreva e selecione (obrigatório)": "Type and select (required)",
  "Este pagamento já foi cancelado.": "This payment has already been cancelled.",
  "Fechar": "Close",
  "Fechar mesa e pagar": "Close table and pay",
  "Finalizar venda": "Finish sale",
  "Funcionário": "Employee",
  "Funcionários": "Employees",
  "Funcionário": "Employee",
  "Idioma": "Language",
  "Indique ano e valor válidos.": "Enter a valid year and amount.",
  "Indique o nome da categoria.": "Enter the category name.",
  "Indique o nome da mesa.": "Enter the table name.",
  "Indique ano, método de pagamento e valor.": "Enter year, payment method, and amount.",
  "Indique produto, tipo e quantidade.": "Enter product, type, and quantity.",
  "Indique um valor válido para o alerta de stock baixo.": "Enter a valid value for the low-stock alert.",
  "Indique um valor válido.": "Enter a valid value.",
  "Início": "Home",
  "Já existe outro sócio com este número.": "Another member with this number already exists.",
  "Já existe um sócio com este número.": "A member with this number already exists.",
  "Limpar": "Clear",
  "Logótipo": "Logo",
  "Logótipo atualizado com sucesso.": "Logo updated successfully.",
  "Mesa": "Table",
  "Mesa cancelada.": "Table cancelled.",
  "Mesa criada.": "Table created.",
  "Mesa não encontrada ou inativa.": "Table not found or inactive.",
  "Mesa atualizada.": "Table updated.",
  "Mesas": "Tables",
  "Menu principal": "Main menu",
  "Merchandising": "Merchandising",
  "Merchandising (Dinheiro)": "Merchandising (Cash)",
  "Merchandising (Outros pagamentos)": "Merchandising (Other payments)",
  "Método": "Method",
  "Método de pagamento inválido.": "Invalid payment method.",
  "Minhas vendas": "My sales",
  "Movimento de stock registado.": "Stock movement recorded.",
  "Não existe stock suficiente para aumentar a quantidade.": "There is not enough stock to increase the quantity.",
  "Não existe stock suficiente para essa quantidade.": "There is not enough stock for that quantity.",
  "Não foi possível atualizar a mesa.": "Could not update the table.",
  "Não foi possível finalizar a venda.": "Could not finish the sale.",
  "Não pode apagar o seu próprio utilizador.": "You cannot delete your own user.",
  "Não pode inativar uma mesa com conta aberta.": "You cannot deactivate a table with an open order.",
  "Nome do sócio": "Member name",
  "Novo produto de Merchandising": "New merchandising product",
  "Novo sócio": "New member",
  "Novo utilizador": "New user",
  "Nº Sócio": "Member No.",
  "Nº sócio e nome do sócio são obrigatórios para vendas de merchandising.": "Member number and member name are required for merchandising sales.",
  "Número de sócio e nome são obrigatórios.": "Member number and name are required.",
  "Obrigatório": "Required",
  "O nome da aplicação é demasiado longo (máx. 40 caracteres).": "The application name is too long (max. 40 characters).",
  "O PIN deve ter entre 4 e 10 dígitos.": "The PIN must have between 4 and 10 digits.",
  "O PIN de login deve ter entre 4 e 10 dígitos.": "The login PIN must have between 4 and 10 digits.",
  "O prefixo de recibo (Bar) deve ter 1 a 3 letras (A-Z).": "The receipt prefix (Bar) must have 1 to 3 letters (A-Z).",
  "O prefixo de recibo (Merchandising) deve ter 1 a 3 letras (A-Z).": "The receipt prefix (Merchandising) must have 1 to 3 letters (A-Z).",
  "O produto {name} não pode ser vendido nesta vista de merchandising.": "The product {name} cannot be sold in this merchandising view.",
  "O produto {name} não pode ser vendido no ponto de venda.": "The product {name} cannot be sold in the point of sale.",
  "O subtítulo é demasiado longo (máx. 60 caracteres).": "The subtitle is too long (max. 60 characters).",
  "Pagamento": "Payment",
  "Pagamento de cota cancelado.": "Membership dues payment cancelled.",
  "Pagamento de cota registado.": "Membership dues payment recorded.",
  "Pagamento de cotas": "Dues payment",
  "Pagamento não encontrado.": "Payment not found.",
  "Password": "Password",
  "PIN": "PIN",
  "PIN admin": "Admin PIN",
  "PIN de administrador inválido.": "Invalid administrator PIN.",
  "PIN de cancelamento atualizado.": "Cancellation PIN updated.",
  "Ponto de venda": "Point of sale",
  "Ponto de venda (Apenas Bar)": "Point of sale (Bar only)",
  "Preencha nome e email.": "Enter name and email.",
  "Preencha nome, email e password com pelo menos 6 caracteres.": "Enter name, email, and a password with at least 6 characters.",
  "Preencha os campos obrigatorios do produto.": "Fill in the required product fields.",
  "Preencha os campos obrigatorios do produto (inclui tamanho).": "Fill in the required product fields (including size).",
  "Produto criado com sucesso.": "Product created successfully.",
  "Produto atualizado com sucesso.": "Product updated successfully.",
  "Produto indisponível.": "Product unavailable.",
  "Produto não encontrado na mesa.": "Product not found on the table.",
  "Produto removido da listagem.": "Product removed from the list.",
  "Produto removido: {name}.": "Product removed: {name}.",
  "Produto sem stock disponível.": "Product out of stock.",
  "Produtos": "Products",
  "Produtos com baixo stock": "Products with low stock",
  "Produtos em stock": "Products in stock",
  "Produtos mais vendidos": "Best-selling products",
  "Qtd.": "Qty.",
  "Recibo": "Receipt",
  "Registe vendas de merchandising com número e nome de sócio. Esta vista é totalmente separada do ponto de venda do bar.":
    "Record merchandising sales with member number and member name. This view is fully separate from the bar point of sale.",
  "Relatório cotas": "Dues report",
  "Relatório de Cotas": "Dues report",
  "Relatório de Merchandising": "Merchandising report",
  "Relatório Merchandising": "Merchandising report",
  "Relatórios": "Reports",
  "Relatórios Gerais": "General reports",
  "Resumo caixa": "Cash summary",
  "Sair": "Sign out",
  "Selecione uma imagem para atualizar o logótipo.": "Select an image to update the logo.",
  "Sem alertas de stock.": "No stock alerts.",
  "Sem produtos com stock baixo.": "No products with low stock.",
  "Sócio": "Member",
  "Sócio criado com sucesso.": "Member created successfully.",
  "Sócio inativado.": "Member deactivated.",
  "Sócio não encontrado": "Member not found",
  "Sócio atualizado com sucesso.": "Member updated successfully.",
  "Sócios": "Members",
  "Sócios ativos": "Active members",
  "Stock atual": "Current stock",
  "Stock": "Stock",
  "Stock baixo": "Low stock",
  "Stock Merchandising": "Merchandising stock",
  "Stock insuficiente para {name}. Disponível: {stock}.": "Insufficient stock for {name}. Available: {stock}.",
  "Espaço": "Space",
  "Teclado": "Keyboard",
  "Teclado no ecrã": "On-screen keyboard",
  "Todas": "All",
  "Total": "Total",
  "Troco": "Change",
  "Um dos produtos já não está disponível.": "One of the products is no longer available.",
  "Utilizador apagado.": "User deleted.",
  "Utilizador atualizado.": "User updated.",
  "Utilizador bloqueado para preservar o histórico.": "User blocked to preserve history.",
  "Utilizador criado.": "User created.",
  "Utilizador não encontrado": "User not found",
  "Utilizadores": "Users",
  "Valor da cota atualizado para o ano indicado.": "Dues amount updated for the selected year.",
  "Valor default da cota atualizado.": "Default dues amount updated.",
  "Valor recebido": "Amount received",
  "Valor recebido insuficiente para o total da conta.": "Received amount is not enough for the order total.",
  "Valor recebido insuficiente para o total da venda.": "Received amount is not enough for the sale total.",
  "Venda": "Sale",
  "Venda atual": "Current sale",
  "Venda média": "Average sale",
  "Venda cancelada.": "Sale cancelled.",
  "Venda de Merchandising": "Merchandising sale",
  "Venda de merchandising": "Merchandising sale",
  "Venda não encontrada": "Sale not found",
  "Venda sem produtos ou método de pagamento.": "Sale without products or payment method.",
  "Vendas": "Sales",
  "Vendas Bar": "Bar sales",
  "Vendas Merchandising": "Merchandising sales",
  "Vendas por dia": "Sales by day",
  "Vendas por funcionário": "Sales by employee",
  "Vendas por produto": "Sales by product",
  "Vendas recentes": "Recent sales",
  "Ver mesas": "View tables",
  "deixe vazio para manter": "leave blank to keep",
  "opcional": "optional",
};

function getSupportedLanguages() {
  return SUPPORTED_LANGUAGES.map((language) => ({ ...language }));
}

function normalizeLanguage(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized.startsWith("en")) {
    return "en-GB";
  }
  return "pt-PT";
}

function getDictionary(locale) {
  return normalizeLanguage(locale).startsWith("en") ? EN_TRANSLATIONS : {};
}

function interpolate(template, replacements = {}) {
  return String(template).replace(/\{(\w+)\}/g, (_, key) => {
    if (Object.prototype.hasOwnProperty.call(replacements, key)) {
      return String(replacements[key]);
    }
    return `{${key}}`;
  });
}

function translateText(text, locale, replacements = {}) {
  const dictionary = getDictionary(locale);
  const translated = dictionary[String(text)] || String(text);
  return interpolate(translated, replacements);
}

function createTranslator(locale) {
  return (text, replacements = {}) => translateText(text, locale, replacements);
}

function translateHtml(html, locale) {
  const dictionary = getDictionary(locale);
  if (!Object.keys(dictionary).length) {
    return html;
  }

  return Object.entries(dictionary)
    .sort((a, b) => b[0].length - a[0].length)
    .reduce((output, [source, target]) => output.split(source).join(target), String(html));
}

module.exports = {
  createTranslator,
  getSupportedLanguages,
  normalizeLanguage,
  translateHtml,
  translateText,
};
