-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Host: 127.0.0.1
-- Generation Time: Apr 10, 2026 at 02:11 AM
-- Server version: 10.4.32-MariaDB
-- PHP Version: 8.2.12

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `autoassis_db`
--

-- --------------------------------------------------------

--
-- Table structure for table `movimentacoes`
--

CREATE TABLE `movimentacoes` (
  `id` int(11) NOT NULL,
  `tipo` varchar(20) NOT NULL,
  `pecaId` varchar(20) NOT NULL,
  `quantidade` int(11) NOT NULL,
  `data` varchar(50) NOT NULL,
  `obs` text DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `movimentacoes`
--

INSERT INTO `movimentacoes` (`id`, `tipo`, `pecaId`, `quantidade`, `data`, `obs`) VALUES
(1, 'saida', 'PEC-001', 1, '2026-03-24', ''),
(2, 'saida', 'PEC-001', 1, '2026-03-24', ''),
(3, 'entrada', 'PEC-001', 1, '2026-03-24', ''),
(4, 'saida', '2', 1, '2026-03-24', ''),
(5, 'saida', '3', 1, '2026-03-24', ''),
(6, 'entrada', '6', 1, '2026-03-26', ''),
(7, 'entrada', '4', 1, '2026-03-26', ''),
(8, 'entrada', '6', 1, '2026-03-26', ''),
(9, 'Entrada', '6', 1, '2026-03-26', ''),
(10, 'Entrada', '6', 1, '2026-03-26', ''),
(11, 'Saída', '6', 1, '2026-03-26', ''),
(12, 'Entrada', '6', 1, '2026-03-26', ''),
(13, 'Entrada', '4', 1, '2026-03-26', ''),
(14, 'Saída', '6', 1, '2026-03-26', ''),
(15, 'Entrada', '6', 1, '2026-03-26', ''),
(16, 'Entrada', '7', 3, '2026-03-26', 'Ok'),
(17, 'Entrada', '6', 1, '2026-03-26', ''),
(18, 'Saída', '6', 1, '2026-03-26', ''),
(19, 'Saída', '9', 3, '2026-03-26', '');

-- --------------------------------------------------------

--
-- Table structure for table `pecas`
--

CREATE TABLE `pecas` (
  `id` int(20) NOT NULL,
  `nome` varchar(100) NOT NULL,
  `categoria` varchar(50) DEFAULT NULL,
  `localizacao` varchar(50) DEFAULT NULL,
  `quantidade` int(11) DEFAULT 0,
  `min` int(11) DEFAULT 5,
  `preco` decimal(10,2) DEFAULT 0.00
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `pecas`
--

INSERT INTO `pecas` (`id`, `nome`, `categoria`, `localizacao`, `quantidade`, `min`, `preco`) VALUES
(2, 'motor', 'Motor', 'b4', 9, 5, 15.00),
(3, 'Suspensão', 'Suspensão', 'c4', 10, 1, 10.00),
(5, 'Filtro de óleo', 'Fluidos', 'Prateleira B3', 110, 50, 20.00),
(6, 'Oleo', 'Fluidos', 'B4', 5, 5, 10.00),
(7, 'Escapamento', 'Motor', 'Prateleira B2', 6, 5, 500.00),
(8, 'Carburador', 'Outros', 'Prateleira a3', 1, 5, 200.05),
(9, 'Bico injetor', 'Outros', 'Prateleira a4', 6, 5, 150.00);

-- --------------------------------------------------------

--
-- Table structure for table `solicitacoes`
--

CREATE TABLE `solicitacoes` (
  `id` int(11) NOT NULL,
  `nomeCliente` varchar(100) NOT NULL,
  `emailCliente` varchar(100) NOT NULL,
  `telefone` varchar(20) DEFAULT NULL,
  `veiculo` varchar(100) NOT NULL,
  `ano` varchar(10) DEFAULT NULL,
  `placa` varchar(20) DEFAULT NULL,
  `problema` text NOT NULL,
  `urgencia` varchar(20) DEFAULT NULL,
  `status` varchar(50) DEFAULT 'Pendente',
  `dataCriacao` varchar(50) DEFAULT NULL,
  `custoSugerido` decimal(10,2) DEFAULT NULL,
  `osNumero` varchar(50) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `solicitacoes`
--

INSERT INTO `solicitacoes` (`id`, `nomeCliente`, `emailCliente`, `telefone`, `veiculo`, `ano`, `placa`, `problema`, `urgencia`, `status`, `dataCriacao`, `custoSugerido`, `osNumero`) VALUES
(23, 'Geraldo de Souza Martins Neto', 'gemartineto@gmail.com', '(43) 96941226', 'onix', '2018', 'ABC-1234', 'ivfldjspfkfpolçekopf', 'Baixa', 'Concluído', '2026-03-24T18:55:05.522Z', 100.00, 'OS-1060'),
(24, 'Geraldo de Souza Martins Neto', 'gemartineto@gmail.com', '(43) 96941226', 'onix', '2018', 'ABC-1234', 'djslfrenwolfnwln', 'Média', 'Concluído', '2026-03-24T19:22:02.132Z', 100.00, 'OS-2812'),
(25, 'Natyla', 'natylabusnello@gmail.com', '43 991672106', 'fiat uno', '2018', 'ABC-1234', 'ofdsjofijooijoijk', 'Média', 'Aguardando Aprovação', '2026-03-24T19:35:06.689Z', 100.00, 'OS-6816'),
(26, 'dsfegrefagrs', 'gejfeoijfoeijfo@gmail.com', '(43) 96941226', 'uno', '2018', 'ABC-1233', 'dsgrgdgrgdjesfji', 'Média', 'Concluído', '2026-03-24T19:36:00.566Z', 1000.00, 'OS-8670'),
(27, 'Geraldo de Souza Martins Neto', 'gemartineto@gmail.com', '43 991672106', 'fiat', '2018', 'ABC-1234', 'disfnofjofjojojofjok', 'Média', 'Concluído', '2026-03-24T19:38:13.011Z', 100.00, 'OS-2269'),
(28, 'Gustavo Fridous', 'gufridous@gmail.com', '(43) 96941226', 'onix', '2018', 'ABC-1234', 'Ta com problema no filtro', 'Média', 'Concluído', '2026-03-25T23:51:40.445Z', 100.00, 'OS-6586'),
(29, 'Gustavo fridous', 'gufridous@gmail.com', '43 991202612', 'uno', '2018', 'ABC-1234', 'Cliente falou que esta com problema no motor', 'Média', 'Concluído', '2026-03-25T23:56:28.699Z', 100.00, 'OS-3489'),
(30, 'Dodo', 'natybusnello@gmail.com', '(43) 96941226', 'onix', '2018', 'ABC-1234', 'foeofrokefkosfk', 'Baixa', 'Concluído', '2026-03-26T00:04:21.346Z', 100.00, 'OS-7686'),
(32, 'Dodo', 'natybusnello@gmail.com', '(43) 96941226', 'onix', '2018', 'ABC-1234', 'parou de vez aqui', 'Alta', 'Concluído', '2026-03-26T00:07:41.804Z', 100.00, 'OS-4135'),
(36, 'Geraldo', 'gemartineto@gmail.com', '43 991672106', 'uno', '2000', 'ABC-1234', 'ele esta com problema no motor', 'Média', 'Aguardando Aprovação', '2026-03-26T17:03:09.680Z', 100.00, 'OS-5371'),
(39, 'João', 'supermatheusdamas@gmail.com', '43984248116', 'Peugeot Escapade', '2009', 'mat1604', 'Problema no disco de freio', 'Média', 'Concluído', '2026-03-26T17:19:23.208Z', 900.00, 'OS-2835'),
(40, 'Matheus Damas Assis', 'banha@gmail.com', '43 984248116', 'Onix 1.0', '2015', 'ABC1234', 'Ta com problema no disco', 'Alta', 'Em Análise', '2026-03-26T17:34:57.158Z', NULL, NULL);

--
-- Indexes for dumped tables
--

--
-- Indexes for table `movimentacoes`
--
ALTER TABLE `movimentacoes`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `pecas`
--
ALTER TABLE `pecas`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `solicitacoes`
--
ALTER TABLE `solicitacoes`
  ADD PRIMARY KEY (`id`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `movimentacoes`
--
ALTER TABLE `movimentacoes`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=20;

--
-- AUTO_INCREMENT for table `pecas`
--
ALTER TABLE `pecas`
  MODIFY `id` int(20) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=10;

--
-- AUTO_INCREMENT for table `solicitacoes`
--
ALTER TABLE `solicitacoes`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=41;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
