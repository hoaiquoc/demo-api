export const swaggerDocument = {
  openapi: '3.0.3',
  info: {
    title: 'QuanLyChiTieu API',
    version: '1.0.0',
    description: 'Node.js API for expense management',
  },
  servers: [
    {
      url: '/',
      description: 'Current server',
    },
  ],
  tags: [
    {
      name: 'Transactions',
      description: 'Manage income and expense transactions',
    },
  ],
  components: {
    schemas: {
      TransactionItem: {
        type: 'object',
        properties: {
          id: { type: 'string', example: 'a8a1d4a0-2d7b-4b1b-9a11-06db1595f230' },
          title: { type: 'string', example: 'An sang' },
          accountId: { type: 'string', example: 'cash' },
          categoryId: { type: 'string', example: 'food' },
          amount: { type: 'number', example: 45000 },
          type: { type: 'string', enum: ['Income', 'Expense'], example: 'Expense' },
          occurredAt: { type: 'string', format: 'date-time', example: '2026-06-24T08:00:00.000Z' },
          note: { type: 'string', example: 'Banh mi va ca phe' },
          createdBy: { type: 'string', example: 'Minh' },
        },
        required: ['id', 'title', 'accountId', 'categoryId', 'amount', 'type', 'occurredAt', 'createdBy'],
      },
      TransactionInput: {
        type: 'object',
        properties: {
          title: { type: 'string', example: 'Luong thang' },
          accountId: { type: 'string', example: 'bank' },
          categoryId: { type: 'string', example: 'salary' },
          amount: { type: 'number', example: 15000000 },
          type: { type: 'string', enum: ['Income', 'Expense'], example: 'Income' },
          occurredAt: { type: 'string', format: 'date-time', example: '2026-06-24T08:00:00.000Z' },
          note: { type: 'string', example: 'Chuyen khoan' },
          createdBy: { type: 'string', example: 'Minh' },
        },
        required: ['title', 'accountId', 'categoryId', 'amount', 'type', 'occurredAt', 'createdBy'],
      },
      LoginRequest: {
        type: 'object',
        properties: {
          email: { type: 'string', example: 'minh@chitieu.vn' },
          password: { type: 'string', example: '123456' },
        },
        required: ['email', 'password'],
      },
      AuthUser: {
        type: 'object',
        properties: {
          id: { type: 'string', example: 'u1' },
          email: { type: 'string', example: 'minh@chitieu.vn' },
          fullName: { type: 'string', example: 'Nguyễn Quang Minh' },
          role: { type: 'string', enum: ['Owner', 'Editor', 'Viewer'], example: 'Owner' },
          avatar: { type: 'string', example: 'MN' },
          spaces: { type: 'number', example: 3 },
        },
        required: ['id', 'email', 'fullName', 'role', 'avatar', 'spaces'],
      },
      LoginResponse: {
        type: 'object',
        properties: {
          accessToken: { type: 'string', example: 'token-123' },
          user: { $ref: '#/components/schemas/AuthUser' },
        },
        required: ['accessToken', 'user'],
      },
    },
  },
  paths: {
    '/health': {
      get: {
        summary: 'Health check',
        responses: {
          200: {
            description: 'Application is running',
          },
        },
      },
    },
    '/api/transactions': {
      get: {
        tags: ['Transactions'],
        summary: 'Get all transactions',
        responses: {
          200: {
            description: 'Transaction list',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: {
                    $ref: '#/components/schemas/TransactionItem',
                  },
                },
              },
            },
          },
        },
      },
      post: {
        tags: ['Transactions'],
        summary: 'Create a transaction',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/TransactionInput',
              },
            },
          },
        },
        responses: {
          201: {
            description: 'Transaction created',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/TransactionItem',
                },
              },
            },
          },
        },
      },
    },
    '/api/transactions/{id}': {
      get: {
        tags: ['Transactions'],
        summary: 'Get transaction by id',
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string' },
          },
        ],
        responses: {
          200: {
            description: 'Transaction detail',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/TransactionItem',
                },
              },
            },
          },
          404: {
            description: 'Transaction not found',
          },
        },
      },
      put: {
        tags: ['Transactions'],
        summary: 'Update a transaction',
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string' },
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/TransactionInput',
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Transaction updated',
          },
          404: {
            description: 'Transaction not found',
          },
        },
      },
      delete: {
        tags: ['Transactions'],
        summary: 'Delete a transaction',
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string' },
          },
        ],
        responses: {
          204: {
            description: 'Transaction deleted',
          },
          404: {
            description: 'Transaction not found',
          },
        },
      },
    },
    '/api/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Đăng nhập',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/LoginRequest',
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Login success',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/LoginResponse',
                },
              },
            },
          },
          401: {
            description: 'Invalid credentials',
          },
        },
      },
    },
  },
};
