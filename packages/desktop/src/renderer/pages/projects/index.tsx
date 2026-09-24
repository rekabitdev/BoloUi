/**
 * @license
 * Copyright 2026 BoloUi (boloui.com)
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useMemo, useState } from 'react';
import { ipcBridge } from '@/common';
import { Button, Card, Empty, Grid, Space, Typography } from '@arco-design/web-react';
import { FolderOpen, Plus, SettingTwo } from '@icon-park/react';
import { useNavigate } from 'react-router-dom';
import { useConversations } from '../conversation/GroupedHistory/hooks/useConversations';
import ProjectProfileModal, {
  loadProjectProfile,
} from '../conversation/GroupedHistory/ProjectProfileModal';

const { Row, Col } = Grid;
const PROJECT_REGISTRY_KEY = 'boloui.projects';

const loadProjectRegistry = (): string[] => {
  try {
    const value = JSON.parse(localStorage.getItem(PROJECT_REGISTRY_KEY) ?? '[]') as unknown;
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
};

const projectDisplayName = (workspace: string) => {
  const parts = workspace.split(/[\\/]/);
  return parts.findLast((part) => part.length > 0) ?? workspace;
};

const ProjectsPage: React.FC = () => {
  const navigate = useNavigate();
  const { conversations } = useConversations();
  const [profileProject, setProfileProject] = useState<{ key: string; name: string } | null>(null);
  const [registeredProjects, setRegisteredProjects] = useState(loadProjectRegistry);

  const projects = useMemo(() => {
    const map = new Map<string, { workspace: string; count: number; updatedAt: number }>();
    for (const workspace of registeredProjects) {
      map.set(workspace, { workspace, count: 0, updatedAt: 0 });
    }
    for (const conversation of conversations) {
      const workspace = conversation.extra?.workspace?.trim();
      if (!workspace) continue;
      const current = map.get(workspace);
      map.set(workspace, {
        workspace,
        count: (current?.count ?? 0) + 1,
        updatedAt: Math.max(current?.updatedAt ?? 0, conversation.modified_at ?? 0),
      });
    }
    return [...map.values()].toSorted((a, b) => b.updatedAt - a.updatedAt);
  }, [conversations, registeredProjects]);

  const openNewProject = async () => {
    const selected = await ipcBridge.dialog.showOpen.invoke({ properties: ['openDirectory', 'createDirectory'] });
    const workspace = selected[0];
    if (!workspace) return;
    setRegisteredProjects((current) => {
      if (current.includes(workspace)) return current;
      const next = [...current, workspace];
      localStorage.setItem(PROJECT_REGISTRY_KEY, JSON.stringify(next));
      return next;
    });
    setProfileProject({ key: workspace, name: projectDisplayName(workspace) });
  };

  const openProjectChat = (workspace: string, cowork = false) => {
    const profile = loadProjectProfile(workspace);
    void navigate('/', {
      state: {
        workspace: cowork && profile.coworkWorkspace ? profile.coworkWorkspace : workspace,
        projectWorkspace: workspace,
        projectModel: profile.model,
      },
    });
  };

  return (
    <div className='h-full overflow-y-auto p-24px md:p-32px'>
      <div className='max-w-1080px mx-auto'>
        <div className='flex items-center justify-between mb-24px'>
          <div>
            <Typography.Title heading={3} className='!mb-4px'>Projects</Typography.Title>
            <Typography.Text type='secondary'>Organize chats, models, instructions, skills, context, and Cowork folders.</Typography.Text>
          </div>
          <Button type='primary' icon={<Plus />} onClick={() => void openNewProject()}>Add Project</Button>
        </div>

        {projects.length === 0 ? (
          <Card><Empty description='No projects yet. Create a chat with a workspace to start a project.' /></Card>
        ) : (
          <Row gutter={[16, 16]}>
            {projects.map((project) => (
              <Col key={project.workspace} xs={24} sm={12} lg={8}>
                <Card
                  hoverable
                  title={
                    <Space>
                      <FolderOpen theme='outline' size={18} />
                      <span className='truncate'>{projectDisplayName(project.workspace)}</span>
                    </Space>
                  }
                  extra={
                    <Button
                      type='text'
                      size='small'
                      icon={<SettingTwo />}
                      onClick={(event) => {
                        event.stopPropagation();
                        setProfileProject({ key: project.workspace, name: project.workspace });
                      }}
                    />
                  }
                >
                  <Typography.Paragraph type='secondary' ellipsis={{ rows: 2 }}>
                    {project.workspace}
                  </Typography.Paragraph>
                  <Typography.Paragraph>{project.count} chat{project.count === 1 ? '' : 's'}</Typography.Paragraph>
                  <Space wrap>
                    <Button type='primary' size='small' onClick={() => openProjectChat(project.workspace)}>New Chat</Button>
                    <Button size='small' onClick={() => openProjectChat(project.workspace, true)}>Cowork Desktop</Button>
                  </Space>
                </Card>
              </Col>
            ))}
          </Row>
        )}
      </div>

      {profileProject && (
        <ProjectProfileModal
          visible
          projectKey={profileProject.key}
          projectName={profileProject.name}
          onClose={() => setProfileProject(null)}
        />
      )}
    </div>
  );
};

export default ProjectsPage;
