import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
} from '@nestjs/common';
import { ProjectsService, CreateProjectDto, UpdateProjectDto } from './projects.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

@ApiTags('projects')
@ApiBearerAuth()
@Controller('projects')
export class ProjectsController {
  constructor(private projectsService: ProjectsService) {}

  @Post()
  @ApiOperation({ summary: 'Create project (Admin / canEditInventory)' })
  create(@CurrentUser() user: any, @Body() dto: CreateProjectDto) {
    return this.projectsService.createProject(
      user.companyId, dto, user.designation, user.permissions.canEditInventory,
    );
  }

  @Get()
  @ApiOperation({ summary: 'Get all active projects' })
  getAll(@CurrentUser('companyId') companyId: string) {
    return this.projectsService.getProjects(companyId);
  }

  @Get('dropdown')
  @ApiOperation({ summary: 'Projects dropdown list' })
  getDropdown(@CurrentUser('companyId') companyId: string) {
    return this.projectsService.getProjectsDropdown(companyId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get project by ID' })
  getById(@CurrentUser('companyId') companyId: string, @Param('id') id: string) {
    return this.projectsService.getProjectById(companyId, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update project' })
  update(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: UpdateProjectDto) {
    return this.projectsService.updateProject(
      user.companyId, id, dto, user.designation, user.permissions.canEditInventory,
    );
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft delete project (Admin only)' })
  delete(@CurrentUser() user: any, @Param('id') id: string) {
    return this.projectsService.deleteProject(user.companyId, id, user.designation);
  }
}