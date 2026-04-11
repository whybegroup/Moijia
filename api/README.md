# Moija API

REST API for Moija - A social event planning platform for groups.

## OnPrem

```bash
brew install caddy
```

```bash
sudo cat >> /opt/homebrew/etc/Caddyfile << EOF
api.danielbyun.com {
        tls /opt/homebrew/etc/moija-api.pem /opt/homebrew/etc/moija-api-privkey.pem
        reverse_proxy 127.0.0.1:3000
}

moija.danielbyun.com {
        tls /opt/homebrew/etc/moija-ui.pem /opt/homebrew/etc/moija-ui-privkey.pem
        reverse_proxy 127.0.0.1:8081
}
EOF
```

```bash
brew services start caddy
```

## EC2

```bash
scp ~/.ssh/id_ed25519 ~/.ssh/id_ed25519.pub ubuntu@ec2:~/.ssh
```

```bash
sudo apt update
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https vim
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install -y caddy
```

```bash
sudo cat >> /etc/caddy/Caddyfile << EOF
# The Caddyfile is an easy way to configure your Caddy web server.
#
# Unless the file starts with a global options block, the first
# uncommented line is always the address of your site.
#
# To use your own domain name (with automatic HTTPS), first make
# sure your domain's A/AAAA DNS records are properly pointed to
# this machine's public IP, then replace ":80" below with your
# domain name.

api.danielbyun.com {
        # Set this path to your site's directory.
        root * /usr/share/caddy

        # Enable the static file server.
        file_server

        # Another common task is to set up a reverse proxy:
        reverse_proxy 127.0.0.1:3000

        # Or serve a PHP site through php-fpm:
        # php_fastcgi localhost:9000
}

# Refer to the Caddy docs for more information:
# https://caddyserver.com/docs/caddyfile
EOF
```

```bash
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
sudo systemctl status caddy
```

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.4/install.sh | bash
source ~/.bashrc
```

```bash
git clone git@github.com:whybegroup/Moija.git
cd Moija/api
nvm install
nvm use
npm install
npm run build
npm start
```

## Architecture Overview

Moija uses a **code-first approach** with TypeScript as the single source of truth:

1. **TypeScript Models**: Define data structures once in TypeScript interfaces
2. **Controllers**: Define API endpoints with tsoa decorators
3. **Prisma Schema**: Define database schema separately
4. **Type Safety**: End-to-end TypeScript from database to API client

```
┌─────────────────────────────────────────────────────────────┐
│                   SOURCE OF TRUTH                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌────────────────────┐         ┌──────────────────────┐    │
│  │  prisma/schema     │         │  TypeScript Models   │    │
│  │  (Database)        │         │  + Controllers       │    │
│  └─────────┬──────────┘         └──────────┬───────────┘    │
└────────────┼───────────────────────────────┼────────────────┘
             │                               │
             ▼                               ▼
   ┌─────────────────┐           ┌──────────────────┐
   │ prisma generate │           │  tsoa generate   │
   └────────┬────────┘           └────────┬─────────┘
            │                             │
            ▼                             ▼
   ┌─────────────────┐           ┌──────────────────┐
   │  Migrations     │           │  openapi.yaml    │
   └────────┬────────┘           └────────┬─────────┘
            │                             │
            ▼                             ▼
   ┌─────────────────┐           ┌──────────────────┐
   │ SQLite Database │           │ TypeScript Client│
   └─────────────────┘           └──────────────────┘
```

### Key Features

- **Code-First API**: Define endpoints once in TypeScript with decorators
- **Auto-Generated OpenAPI**: Spec generated from controller decorators
- **Auto-Generated Client**: Type-safe TypeScript client for consumers
- **Type Safety**: End-to-end TypeScript from API to database
- **Hot Reload**: Automatic regeneration during development
- **Migration Management**: Version-controlled database migrations with Prisma

## Quick Start

### Prerequisites

- Node.js 18+
- npm

### Installation

```bash
# Install dependencies
npm install
```

### Development

```bash
# Start dev server with hot reload and auto-generation
npm run dev
```

The API will be available at:
- API Base: http://localhost:3000/api
- API Docs: http://localhost:3000/docs
- Health Check: http://localhost:3000/health

### Production

```bash
# Build for production
npm run build

# Start production server
npm start
```

## Project Structure

```
api/
├── src/
│   ├── models/              # TypeScript interfaces for API
│   │   ├── User.ts
│   │   ├── Group.ts
│   │   ├── Event.ts
│   │   ├── Notification.ts
│   │   └── index.ts
│   │
│   ├── controllers/         # API endpoint definitions with tsoa decorators
│   │   ├── UserController.ts
│   │   ├── GroupController.ts
│   │   ├── EventController.ts
│   │   └── NotificationController.ts
│   │
│   ├── services/            # Business logic and Prisma interactions
│   │   ├── UserService.ts
│   │   ├── GroupService.ts
│   │   ├── EventService.ts
│   │   └── NotificationService.ts
│   │
│   ├── generated/           # Auto-generated routes & OpenAPI (do not edit)
│   │   ├── routes.ts        # Express routes (from tsoa)
│   │   └── openapi.yaml     # OpenAPI specification
│   │
│   ├── db.ts                # Prisma Client instance
│   └── server.ts            # Express server setup
│
├── client/                  # Auto-generated TypeScript client (do not edit)
│   ├── services/            # API service classes
│   ├── models/              # TypeScript types
│   └── core/                # HTTP client core
│
├── prisma/
│   ├── schema.prisma        # Prisma database schema
│   ├── migrations/          # Database migrations
│   ├── seed.ts              # Database seeding script
│   └── moija.db            # SQLite database file
│
├── dist/                    # Compiled JavaScript
├── tsoa.json                # tsoa configuration
└── tsconfig.json            # TypeScript configuration
```

## Development Workflow

### Adding a New Endpoint

1. **Define Model** (if needed) in `src/models/`:

```typescript
export interface User {
  id: string;
  name: string;
  displayName: string;
  handle: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserInput {
  id: string;
  name: string;
  displayName: string;
  handle: string;
}
```

2. **Create Controller** in `src/controllers/`:

```typescript
import { Body, Controller, Get, Path, Post, Route, Tags } from 'tsoa';
import { User, UserInput } from '../models';
import { UserService } from '../services/UserService';

@Route('api/users')
@Tags('Users')
export class UserController extends Controller {
  private userService = new UserService();

  /**
   * Get all users
   * @summary Retrieves a list of all users
   */
  @Get()
  public async getUsers(): Promise<User[]> {
    return this.userService.getAll();
  }

  /**
   * Create a new user
   */
  @Post()
  public async createUser(@Body() body: UserInput): Promise<User> {
    return this.userService.create(body);
  }

  /**
   * Get user by ID
   * @summary Retrieves a single user
   * @param id User's unique identifier
   */
  @Get('{id}')
  public async getUser(@Path() id: string): Promise<User> {
    const user = await this.userService.getById(id);
    if (!user) {
      this.setStatus(404);
      throw new Error('User not found');
    }
    return user;
  }
}
```

3. **Implement Service** in `src/services/`:

```typescript
import { PrismaClient } from '@prisma/client';
import { User, UserInput } from '../models';

const prisma = new PrismaClient();

export class UserService {
  public async getAll(): Promise<User[]> {
    return prisma.user.findMany();
  }

  public async getById(id: string): Promise<User | null> {
    return prisma.user.findUnique({ where: { id } });
  }

  public async create(input: UserInput): Promise<User> {
    return prisma.user.create({ data: input });
  }
}
```

4. **Save** → Routes and OpenAPI are auto-generated
5. **Test** → Visit http://localhost:3000/docs

### Adding a Database Model

1. **Edit Prisma Schema** (`prisma/schema.prisma`):

```prisma
model Tag {
  id        String   @id @default(uuid())
  name      String   @unique
  createdAt DateTime @default(now())
  
  events EventTag[]
  
  @@map("tags")
}

model EventTag {
  id      Int    @id @default(autoincrement())
  eventId String
  tagId   String
  
  event Event @relation(fields: [eventId], references: [id], onDelete: Cascade)
  tag   Tag   @relation(fields: [tagId], references: [id], onDelete: Cascade)
  
  @@unique([eventId, tagId])
  @@map("event_tags")
}
```

2. **Create Migration**:

```bash
npm run db:migrate
```

3. **Create TypeScript Model** in `src/models/Tag.ts`
4. **Create Controller** in `src/controllers/TagController.ts`
5. **Create Service** in `src/services/TagService.ts`

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server with hot reload & auto-generation |
| `npm run build` | Build TypeScript to JavaScript |
| `npm start` | Start production server |
| `npm run generate` | Generate routes, OpenAPI, and client |
| `npm run generate:routes` | Generate routes and OpenAPI only |
| `npm run generate:client` | Generate TypeScript client only |
| `npm run db:migrate` | Create and apply database migration |
| `npm run db:push` | Push schema without migration (dev) |
| `npm run db:studio` | Open Prisma Studio (database GUI) |
| `npm run db:reset` | Reset database (WARNING: deletes all data) |
| `npm run seed` | Seed database with sample data |

## API Endpoints

### Users
- `GET /api/users` - List all users
- `GET /api/users/:id` - Get user by ID
- `POST /api/users` - Create user
- `PUT /api/users/:id` - Update user
- `DELETE /api/users/:id` - Delete user

### Groups
- `GET /api/groups` - List all groups
- `GET /api/groups/:id` - Get group by ID
- `GET /api/groups/:id/members` - Get group members
- `POST /api/groups` - Create group
- `PUT /api/groups/:id` - Update group
- `DELETE /api/groups/:id` - Delete group

### Events
- `GET /api/events` - List events (with filtering)
- `GET /api/events/:id` - Get event with RSVPs & comments
- `POST /api/events` - Create event
- `PUT /api/events/:id` - Update event
- `DELETE /api/events/:id` - Delete event
- `POST /api/events/:id/rsvps` - Create/update RSVP
- `DELETE /api/events/:id/rsvps/:userId` - Delete RSVP
- `GET /api/events/:id/comments` - Get comments
- `POST /api/events/:id/comments` - Create comment

### Comments
- `DELETE /api/comments/:id` - Delete comment

### Notifications
- `GET /api/notifications` - List notifications
- `GET /api/notifications/:id` - Get notification
- `POST /api/notifications` - Create notification
- `PUT /api/notifications/:id` - Update notification

## OpenAPI & Documentation

### Auto-Generated OpenAPI Spec

The OpenAPI spec is automatically generated from controller decorators.

**View it at:**
- File: `src/generated/openapi.yaml`
- Interactive docs: http://localhost:3000/docs

### tsoa Decorators

Use these decorators to define your API:

- `@Route('path')` - Define base route
- `@Tags('Tag')` - Group endpoints
- `@Get()`, `@Post()`, `@Put()`, `@Delete()` - HTTP methods
- `@Path()` - Path parameters
- `@Query()` - Query parameters
- `@Body()` - Request body
- `@SuccessResponse('code', 'message')` - Document responses

### Adding Documentation

Use JSDoc comments in controllers for better OpenAPI docs:

```typescript
/**
 * Get user by ID
 * @summary Retrieves a single user by their unique identifier
 * @param id The user's unique identifier
 * @returns The user object
 */
@Get('{id}')
public async getUser(@Path() id: string): Promise<User> {
  const user = await this.userService.getById(id);
  if (!user) {
    this.setStatus(404);
    throw new Error('User not found');
  }
  return user;
}
```

## Database Management

### Using Prisma Client

Prisma provides type-safe database access:

#### Basic Queries

```typescript
import prisma from './db';

// Find all users
const users = await prisma.user.findMany();

// Find user by ID
const user = await prisma.user.findUnique({
  where: { id: '123' }
});

// Find with relations
const user = await prisma.user.findUnique({
  where: { id: '123' },
  include: {
    groupMemberships: true,
    createdEvents: true
  }
});

// Create user
const newUser = await prisma.user.create({
  data: {
    id: '456',
    name: 'John Doe',
    displayName: 'John (SF, 2024)',
    handle: '@johndoe'
  }
});

// Update user
const updated = await prisma.user.update({
  where: { id: '123' },
  data: { name: 'Jane Doe' }
});

// Delete user
await prisma.user.delete({
  where: { id: '123' }
});
```

#### Complex Queries

```typescript
// Find events with filters
const events = await prisma.event.findMany({
  where: {
    groupId: 'abc123',
    start: {
      gte: new Date('2026-03-20')
    }
  },
  include: {
    group: true,
    coverPhotos: true,
    rsvps: {
      include: {
        user: true
      }
    }
  },
  orderBy: {
    start: 'asc'
  }
});

// Count RSVPs
const goingCount = await prisma.rSVP.count({
  where: {
    eventId: 'xyz789',
    status: 'going'
  }
});

// Aggregations
const stats = await prisma.event.aggregate({
  where: { groupId: 'abc123' },
  _count: true,
  _avg: { minAttendees: true }
});
```

#### Transactions

```typescript
// Create group with members atomically
const result = await prisma.$transaction(async (tx) => {
  const group = await tx.group.create({
    data: {
      id: 'group123',
      name: 'My Group',
      emoji: '🎉',
      colorHex: '#FF5733',
      desc: 'A cool group',
    }
  });
  
  await tx.groupMember.create({
    data: {
      groupId: group.id,
      userId: 'user123',
      role: 'superadmin'
    }
  });
  
  return group;
});
```

### Database Schema

The database schema is defined in `prisma/schema.prisma` using Prisma's schema language.

#### Core Models

- **User**: User accounts with handles and display names
- **Group**: Social groups with members and events
- **GroupMember**: Junction table for group membership with roles (member, admin, superadmin)
- **Event**: Events with date/time, location, attendance settings
- **EventPhoto**: Cover photos for events
- **RSVP**: User responses to events (going, maybe, notGoing)
- **Comment**: Comments on events with timestamps
- **CommentPhoto**: Photos attached to comments
- **Notification**: User notifications with type, read status, and navigation

#### Relationships

```
User ──┬──< GroupMember >──┬── Group
       │                    │
       ├──< RSVP            ├──< Event
       │         ↑          │       ↑
       └──< Comment         ├──< EventPhoto
                 ↑          └──< RSVP
                 └─< CommentPhoto
```

### Schema Changes Workflow

1. **Edit `prisma/schema.prisma`**:

```prisma
model Event {
  id           String    @id @default(uuid())
  title        String
  capacity     Int?      // Add new field
  // ... other fields
}
```

2. **Create Migration**:

```bash
npm run db:migrate
```

3. **Update TypeScript Model** in `src/models/Event.ts` if needed
4. Server auto-reloads with new schema

### Migration Management

```bash
# Create and apply new migration
npm run db:migrate

# Push schema changes without creating migration (dev only)
npm run db:push

# Reset database (WARNING: deletes all data)
npm run db:reset

# View migrations
ls prisma/migrations/
```

### Database GUI

```bash
# Open Prisma Studio
npm run db:studio
```

Visit http://localhost:5555 to browse and edit data visually.

## TypeScript Client

The generated client is available at `client/` and provides type-safe API access:

```typescript
// Import from the API client directory
import {
  UsersService,
  GroupsService,
  EventsService,
} from '../api/client';

// Use services with full type safety
const users = await UsersService.getUsers();

const events = await EventsService.getEvents({
  groupId: 'abc123',
  startAfter: '2026-03-20T00:00:00Z'
});

// Create event with type checking
const newEvent = await EventsService.createEvent({
  groupId: 'abc123',
  createdBy: 'user123',
  title: 'Team Lunch',
  start: new Date('2026-03-25T12:00:00Z'),
  end: new Date('2026-03-25T14:00:00Z')
});
```

The client is automatically regenerated when you run `npm run generate` or `npm run dev` in the API directory.

## Configuration

### tsoa Configuration (`tsoa.json`)

Controls API generation:

```json
{
  "entryFile": "src/server.ts",
  "controllerPathGlobs": ["src/controllers/**/*.ts"],
  "spec": {
    "outputDirectory": ".",
    "specVersion": 3,
    "yaml": true,
    "name": "Moija API",
    "version": "1.0.0"
  },
  "routes": {
    "routesDir": "src/generated",
    "middleware": "express",
    "basePath": "/api"
  }
}
```

### Prisma Schema (`prisma/schema.prisma`)

Defines database models and relationships. Run `npm run db:migrate` after changes.

## Best Practices

### 1. Keep Models Simple

```typescript
// Good: Simple, focused interface
export interface User {
  id: string;
  name: string;
  email: string;
}
```

### 2. Document Everything

```typescript
/**
 * User model - represents a user in the system
 */
export interface User {
  /** Unique identifier */
  id: string;
  /** User's full name */
  name: string;
}
```

### 3. Use Specific Input/Output Types

```typescript
// Create separate types for different operations
export interface UserInput {
  name: string;
  email: string;
}

export interface UserUpdate {
  name?: string;
  email?: string;
}
```

### 4. Keep Controllers Thin

```typescript
// Good: Delegate to services
@Get()
public async getUsers(): Promise<User[]> {
  return this.userService.getAll();
}
```

### 5. Handle Errors Properly

```typescript
@Get('{id}')
public async getUser(@Path() id: string): Promise<User> {
  const user = await this.userService.getById(id);
  if (!user) {
    this.setStatus(404);
    throw new Error('User not found');
  }
  return user;
}
```

### 6. Use Transactions for Multi-Step Operations

```typescript
await prisma.$transaction(async (tx) => {
  const group = await tx.group.create({ data: groupData });
  await tx.groupMember.create({ data: memberData });
  return group;
});
```

## Technologies

- **[tsoa](https://tsoa-community.github.io/docs/)** - TypeScript OpenAPI generator for API routes
- **[Prisma](https://www.prisma.io/)** - Type-safe database ORM
- **[Express](https://expressjs.com/)** - Web framework
- **[TypeScript](https://www.typescriptlang.org/)** - Type-safe JavaScript
- **[SQLite](https://www.sqlite.org/)** - Embedded database
- **[Scalar](https://github.com/scalar/scalar)** - API documentation UI

## Benefits

✅ **Type Safety** - End-to-end type safety from API to database  
✅ **Auto-Generated OpenAPI** - Spec always in sync with code  
✅ **Auto-Generated Client** - Type-safe client for frontend consumption  
✅ **Migration Management** - Version-controlled database evolution  
✅ **Developer Experience** - Hot reload, autocomplete, IDE support  
✅ **Clear Separation** - Database schema separate from API logic  
✅ **Familiar Tools** - Standard TypeScript patterns and decorators

## Troubleshooting

### Routes Not Generated

```bash
# Manually trigger route generation
npm run generate:routes
```

### Client Out of Sync

```bash
# Regenerate client
npm run generate:client
```

### TypeScript Build Errors

```bash
# Clean build
rm -rf dist
npm run build
```

### Port Already in Use

```bash
# Use different port
PORT=3001 npm run dev
```

### Database Schema Out of Sync

```bash
# Regenerate Prisma Client
npx prisma generate

# Apply to database
npm run db:migrate
```

## Contributing

1. **Models**: Define TypeScript interfaces in `src/models/`
2. **Controllers**: Create API endpoints in `src/controllers/` with tsoa decorators
3. **Services**: Implement business logic in `src/services/`
4. **Schema**: Update database schema in `prisma/schema.prisma`
5. **Save**: Auto-generation happens in dev mode
6. **Test**: Use interactive docs at `/docs`

## Resources

- [tsoa Documentation](https://tsoa-community.github.io/docs/)
- [Prisma Documentation](https://www.prisma.io/docs)
- [Prisma Client API Reference](https://www.prisma.io/docs/reference/api-reference/prisma-client-reference)
- [OpenAPI Specification](https://spec.openapis.org/oas/v3.0.0.html)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/handbook/intro.html)

## License

ISC
