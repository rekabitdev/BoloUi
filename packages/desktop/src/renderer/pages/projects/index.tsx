/**
 * @license
 * Copyright 2026 BoloUi (boloui.com)
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useEffect, useMemo, useState } from 'react';
import { ipcBridge } from '@/common';
import { Button, Card, Empty, Grid, Message, Modal, Space, Typography } from '@arco-design/web-react';
import { Code, Delete, FolderOpen, Plus, SettingTwo } from '@icon-park/react';
import { emitter } from '@/renderer/utils/emitter';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useConversations } from '../conversation/GroupedHistory/hooks/useConversations';
import ProjectProfileModal, { loadProjectProfile } from '../conversation/GroupedHistory/ProjectProfileModal';

const { Row, Col } = Grid;
const PROJECT_REGISTRY_KEY = 'boloui.projects';

const loadLegacyProjectRegistry = (): string[] => {
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
  const { t } = useTranslation();
  const { conversations } = useConversations();
  const [profileProject, setProfileProject] = useState<{ key: string; name: string } | null>(null);
  const [registeredProjects, setRegisteredProjects] = useState<string[]>([]);

  useEffect(() => {
    void (async () => {
      const storedProjects = await ipcBridge.desktopProjects.list.invoke();
      const storedWorkspaces = storedProjects.map((project) => project.workspace);
      const legacyWorkspaces = loadLegacyProjectRegistry().filter((workspace) => !storedWorkspaces.includes(workspace));
      for (const workspace of legacyWorkspaces) {
        const now = new Date().toISOString();
        await ipcBridge.desktopProjects.upsert.invoke({
          entry: {
            id: crypto.randomUUID(),
            name: projectDisplayName(workspace),
            workspace,
            createdAt: now,
            updatedAt: now,
          },
        });
      }
      if (legacyWorkspaces.length > 0) localStorage.removeItem(PROJECT_REGISTRY_KEY);
      setRegisteredProjects([...storedWorkspaces, ...legacyWorkspaces]);
    })().catch((error: unknown) => console.error('Failed to load projects:', error));
  }, []);

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
    if (!registeredProjects.includes(workspace)) {
      const now = new Date().toISOString();
      await ipcBridge.desktopProjects.upsert.invoke({
        entry: {
          id: crypto.randomUUID(),
          name: projectDisplayName(workspace),
          workspace,
          createdAt: now,
          updatedAt: now,
        },
      });
      setRegisteredProjects((current) => [...current, workspace]);
    }
    setProfileProject({ key: workspace, name: projectDisplayName(workspace) });
  };

  const developBoloUi = async () => {
    const workspace = await ipcBridge.desktopProjects.locateBoloUiSource.invoke();
    if (!workspace) {
      Message.error(t('conversation.projects.sourceNotFound'));
      return;
    }
    let project = await ipcBridge.desktopProjects.get.invoke({ workspace });
    if (!project) {
      const now = new Date().toISOString();
      project = await ipcBridge.desktopProjects.upsert.invoke({
        entry: {
          id: crypto.randomUUID(),
          name: 'BoloUi Development',
          workspace,
          createdAt: now,
          updatedAt: now,
        },
        profile: {
          instructions:
            'Develop BoloUi safely in this source repository. Read AGENTS.md and CONTRIBUTING.md before editing. Reuse existing architecture and functions instead of adding duplicate systems. Never modify the installed application directly, kill unrelated AionUi/BoloUi processes, expose secrets, push, or install an update without explicit approval. Inspect git status first, keep changes scoped, show the diff, and run formatting, lint, TypeScript, focused tests, i18n checks when relevant, and packaging when appropriate.',
          skills: ['zahrs-core'],
          context:
            'This Project is the controlled self-development workspace for BoloUi. Work only inside the validated source tree and preserve current user data and running applications.',
          memory: '',
          documents: [
            { name: 'AGENTS.md', content: 'Read AGENTS.md from the source repository before making changes.' },
            {
              name: 'CONTRIBUTING.md',
              content: 'Read CONTRIBUTING.md from the source repository before making changes.',
            },
          ],
        },
      });
      setRegisteredProjects((current) => (current.includes(workspace) ? current : [...current, workspace]));
    }
    const profile = await loadProjectProfile(workspace);
    navigate('/guid', {
      state: {
        cowork: true,
        workspace,
        projectWorkspace: workspace,
        projectName: project.name,
        projectInstructions: profile.instructions,
        projectSkills: profile.skills,
        projectContext: profile.context,
        projectMemory: profile.memory,
        projectDocuments: profile.documents,
        selectedModel: profile.model,
        initialMessage:
          'Inspect the BoloUi source repository and help me develop it safely. Read the repository instructions first, check git status, and do not make changes until I provide a specific task.',
      },
    });
  };

  const deleteProject = (workspace: string) => {
    const projectConversations = conversations.filter(
      (conversation) => conversation.extra?.workspace?.trim() === workspace
    );
    const name = projectDisplayName(workspace);
    Modal.confirm({
      title: `Delete project “${name}”?`,
      content: `${projectConversations.length} chat${projectConversations.length === 1 ? '' : 's'} will be permanently deleted. The folder and files on your computer will not be deleted.`,
      okText: 'Delete Project and Chats',
      cancelText: 'Cancel',
      okButtonProps: { status: 'danger' },
      onOk: async () => {
        const results = await Promise.allSettled(
          projectConversations.map(async (conversation) => {
            const removed = await ipcBridge.conversation.remove.invoke({ id: conversation.id });
            if (!removed) throw new Error(`Conversation ${conversation.id} was not deleted`);
          })
        );
        const failed = results.filter((result) => result.status === 'rejected');
        if (failed.length > 0) {
          Message.error(
            `Project was not removed because ${failed.length} chat${failed.length === 1 ? '' : 's'} could not be deleted.`
          );
          emitter.emit('chat.history.refresh');
          return;
        }

        await ipcBridge.desktopProjects.delete.invoke({ workspace });
        setRegisteredProjects((current) => current.filter((project) => project !== workspace));
        if (profileProject?.key === workspace) setProfileProject(null);
        emitter.emit('chat.history.refresh');
        Message.success(
          `Deleted project “${name}” and ${projectConversations.length} chat${projectConversations.length === 1 ? '' : 's'}.`
        );
      },
    });
  };

  const openProjectChat = (workspace: string, cowork = false) => {
    void loadProjectProfile(workspace, projectDisplayName(workspace)).then((profile) =>
      navigate('/', {
        state: {
          workspace: cowork && profile.coworkWorkspace ? profile.coworkWorkspace : workspace,
          projectWorkspace: workspace,
          projectModel: profile.model,
          projectProfile: {
            instructions: profile.instructions,
            skills: profile.skills,
            context: profile.context,
            memory: profile.memory,
            documents: profile.documents,
          },
        },
      })
    );
  };

  return (
    <div className='h-full overflow-y-auto p-24px md:p-32px'>
      <div className='max-w-1080px mx-auto'>
        <div className='flex items-center justify-between mb-24px'>
          <div>
            <Typography.Title heading={3} className='!mb-4px'>
              Projects
            </Typography.Title>
            <Typography.Text type='secondary'>
              Organize chats, models, instructions, skills, context, and Cowork folders.
            </Typography.Text>
          </div>
          <Space wrap>
            <Button icon={<Code />} onClick={() => void developBoloUi()}>
              {t('conversation.projects.developBoloUi')}
            </Button>
            <Button type='primary' icon={<Plus />} onClick={() => void openNewProject()}>
              Add Project
            </Button>
          </Space>
        </div>

        {projects.length === 0 ? (
          <Card>
            <Empty description='No projects yet. Create a chat with a workspace to start a project.' />
          </Card>
        ) : (
          <Row gutter={[16, 16]}>
            {projects.map((project) => (
              <Col key={project.workspace} xs={24} sm={12} lg={8} className='flex min-w-0'>
                <Card
                  hoverable
                  className='h-full min-h-[244px] min-w-0 w-full overflow-hidden [&_.arco-card-body]:flex [&_.arco-card-body]:h-[176px] [&_.arco-card-body]:min-w-0 [&_.arco-card-body]:flex-col'
                  title={
                    <Space className='min-w-0 max-w-full'>
                      <FolderOpen theme='outline' size={18} className='shrink-0' />
                      <span className='min-w-0 truncate'>{projectDisplayName(project.workspace)}</span>
                    </Space>
                  }
                  extra={
                    <Space size='mini'>
                      <Button
                        type='text'
                        size='small'
                        icon={<SettingTwo />}
                        aria-label={`Configure ${projectDisplayName(project.workspace)}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          setProfileProject({ key: project.workspace, name: project.workspace });
                        }}
                      />
                      <Button
                        type='text'
                        status='danger'
                        size='small'
                        icon={<Delete />}
                        aria-label={`Delete ${projectDisplayName(project.workspace)}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          deleteProject(project.workspace);
                        }}
                      />
                    </Space>
                  }
                >
                  <Typography.Paragraph type='secondary' ellipsis={{ rows: 2 }} className='min-h-[44px] break-all'>
                    {project.workspace}
                  </Typography.Paragraph>
                  <Typography.Paragraph className='mb-12px'>
                    {project.count} chat{project.count === 1 ? '' : 's'}
                  </Typography.Paragraph>
                  <Space wrap className='mt-auto min-w-0'>
                    <Button type='primary' size='small' onClick={() => openProjectChat(project.workspace)}>
                      New Chat
                    </Button>
                    <Button size='small' onClick={() => openProjectChat(project.workspace, true)}>
                      Cowork Desktop
                    </Button>
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
