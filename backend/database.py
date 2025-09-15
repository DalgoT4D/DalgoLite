from sqlalchemy import create_engine, Column, Integer, String, DateTime, Text, JSON, ForeignKey, Boolean
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session, relationship
from sqlalchemy.sql import func
from typing import List, Optional, Dict, Any
import json
from datetime import datetime, timezone

# Database setup
SQLALCHEMY_DATABASE_URL = "sqlite:///./dalgolite.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# Database Models
class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    google_id = Column(String, unique=True, index=True, nullable=False)
    email = Column(String, nullable=False)
    name = Column(String, nullable=False)
    picture_url = Column(String, nullable=True)  # Matches existing DB column
    login_count = Column(Integer, default=1)  # Matches existing DB
    first_login_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    last_login_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    last_ip = Column(String, nullable=True)  # Matches existing DB
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    # New onboarding fields
    onboarding_completed = Column(Boolean, default=False)
    onboarding_step = Column(Integer, default=0)
    onboarding_data = Column(String, nullable=True)  # JSON stored as TEXT
    profile_picture = Column(String, nullable=True)  # Additional field for profile pic

    # Relationships - User owns these resources
    sheets = relationship("ConnectedSheet", back_populates="user", cascade="all, delete-orphan")
    charts = relationship("SavedChart", back_populates="user", cascade="all, delete-orphan")
    transformation_projects = relationship("TransformationProject", back_populates="user", cascade="all, delete-orphan")
class ConnectedSheet(Base):
    __tablename__ = "connected_sheets"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    spreadsheet_id = Column(String, index=True, nullable=False)  # Removed unique constraint for multi-user
    spreadsheet_url = Column(String, nullable=False)
    sheet_name = Column(String, nullable=False)
    title = Column(String, nullable=False)
    connected_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    last_synced = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    total_rows = Column(Integer, default=0)
    columns = Column(JSON)  # Store column names as JSON array
    sample_data = Column(JSON)  # Store first few rows as JSON

    # Relationships
    user = relationship("User", back_populates="sheets")
    charts = relationship("SavedChart", back_populates="sheet", cascade="all, delete-orphan")

class SavedChart(Base):
    __tablename__ = "saved_charts"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    sheet_id = Column(Integer, ForeignKey("connected_sheets.id"), nullable=True)  # Allow null for transformed datasets
    project_id = Column(Integer, nullable=True)  # Charts from transformed data (FK added later)
    chart_name = Column(String, nullable=False)
    chart_type = Column(String, nullable=False)  # bar, line, pie, scatter, histogram
    x_axis_column = Column(String, nullable=True)
    y_axis_column = Column(String, nullable=True)
    chart_config = Column(JSON)  # Store chart.js configuration
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())

    # Relationships
    user = relationship("User", back_populates="charts")
    sheet = relationship("ConnectedSheet", back_populates="charts")

class TransformationProject(Base):
    __tablename__ = "transformation_projects"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    name = Column(String, nullable=False)
    description = Column(Text)
    sheet_ids = Column(JSON)  # Array of connected sheet IDs
    join_config = Column(JSON)  # Join specifications
    transformations = Column(JSON)  # List of transformation rules
    pipeline_status = Column(String, default='draft')  # draft, running, completed, failed
    last_pipeline_run = Column(DateTime)
    schedule_config = Column(JSON)  # Scheduling configuration
    warehouse_table_name = Column(String)  # Name of materialized table in warehouse
    canvas_layout = Column(JSON)  # Store canvas node positions and connections
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    # Relationships
    user = relationship("User", back_populates="transformation_projects")

class AITransformationStep(Base):
    __tablename__ = "ai_transformation_steps"
    
    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("transformation_projects.id"), nullable=False)
    step_name = Column(String, nullable=False)
    user_prompt = Column(Text, nullable=False)  # Natural language description
    output_table_name = Column(String)  # Custom output table name
    generated_code = Column(Text, nullable=False)  # AI-generated pandas code
    code_summary = Column(String)  # One-sentence summary
    code_explanation = Column(Text)  # Detailed explanation
    input_columns = Column(JSON)  # Expected input columns
    output_columns = Column(JSON)  # Expected output columns after transformation
    upstream_step_ids = Column(JSON)  # IDs of upstream transformation steps
    upstream_sheet_ids = Column(JSON)  # IDs of upstream sheets
    canvas_position = Column(JSON)  # Position on canvas (x, y coordinates)
    execution_order = Column(Integer, default=0)  # Order of execution in pipeline
    status = Column(String, default='draft')  # draft, ready, running, completed, failed
    error_message = Column(Text)  # Error message if execution fails
    last_executed = Column(DateTime)
    execution_time_ms = Column(Integer)  # Execution time in milliseconds
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    
    # Relationships
    project = relationship("TransformationProject")

class CanvasNode(Base):
    __tablename__ = "canvas_nodes"
    
    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("transformation_projects.id"), nullable=False)
    node_type = Column(String, nullable=False)  # 'sheet', 'transformation', 'output'
    node_id = Column(String, nullable=False)  # Reference to sheet ID or transformation step ID
    position_x = Column(Integer, default=0)
    position_y = Column(Integer, default=0)
    width = Column(Integer, default=200)
    height = Column(Integer, default=100)
    style_config = Column(JSON)  # Node styling and display options
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    
    # Relationships
    project = relationship("TransformationProject")

class CanvasConnection(Base):
    __tablename__ = "canvas_connections"
    
    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("transformation_projects.id"), nullable=False)
    source_node_id = Column(Integer, ForeignKey("canvas_nodes.id"), nullable=False)
    target_node_id = Column(Integer, ForeignKey("canvas_nodes.id"), nullable=False)
    connection_type = Column(String, default='data_flow')  # Type of connection
    style_config = Column(JSON)  # Connection styling options
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    
    # Relationships
    project = relationship("TransformationProject")
    source_node = relationship("CanvasNode", foreign_keys=[source_node_id])
    target_node = relationship("CanvasNode", foreign_keys=[target_node_id])

class TransformedDataWarehouse(Base):
    __tablename__ = "transformed_data_warehouse"
    
    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("transformation_projects.id"), nullable=False)
    table_name = Column(String, nullable=False, unique=True)
    row_count = Column(Integer, default=0)
    column_schema = Column(JSON)  # Store column names and types
    data_hash = Column(String)  # Hash of the data for change detection
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    
    # Relationships
    project = relationship("TransformationProject")

class JoinOperation(Base):
    __tablename__ = "join_operations"
    
    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("transformation_projects.id"), nullable=False)
    name = Column(String, nullable=False)
    left_table_id = Column(Integer, nullable=False)  # Sheet or transformation step ID
    right_table_id = Column(Integer, nullable=False)  # Sheet or transformation step ID
    left_table_type = Column(String, nullable=False)  # 'sheet' or 'transformation'
    right_table_type = Column(String, nullable=False)  # 'sheet' or 'transformation'
    join_type = Column(String, nullable=False)  # 'inner', 'left', 'right', 'full'
    join_keys = Column(JSON, nullable=False)  # Array of {left: column, right: column}
    status = Column(String, default='pending')  # 'pending', 'completed', 'failed'
    error_message = Column(Text)
    output_table_name = Column(String)  # Generated result table name
    output_columns = Column(JSON)  # Resulting columns after join
    canvas_position = Column(JSON)  # Position on canvas (x, y coordinates)
    execution_time_ms = Column(Integer)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    
    # Relationships
    project = relationship("TransformationProject")

class DataTransformation(Base):
    __tablename__ = "data_transformations"
    
    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("transformation_projects.id"), nullable=False)
    sheet_id = Column(Integer, ForeignKey("connected_sheets.id"), nullable=False)
    column_name = Column(String, nullable=False)
    transformation_type = Column(String, nullable=False)  # lowercase, uppercase, date_format, null_replace, etc.
    parameters = Column(JSON)  # Transformation-specific configuration
    order_index = Column(Integer, default=0)  # Order of transformation execution
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    
    # Relationships
    project = relationship("TransformationProject")
    sheet = relationship("ConnectedSheet")

class PipelineExecutionHistory(Base):
    __tablename__ = "pipeline_execution_history"
    
    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("transformation_projects.id"), nullable=False)
    status = Column(String, nullable=False)  # running, completed, failed
    started_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    completed_at = Column(DateTime, nullable=True)
    error_message = Column(String, nullable=True)
    sheets_synced = Column(Integer, default=0)
    total_sheets = Column(Integer, default=0)
    rows_processed = Column(Integer, nullable=True)
    duration_seconds = Column(Integer, nullable=True)
    
    # Relationships
    project = relationship("TransformationProject")

# Database migration utilities
def migrate_database():
    """Handle database schema migrations safely"""
    from sqlalchemy import inspect, text
    
    inspector = inspect(engine)
    existing_tables = inspector.get_table_names()
    
    # Check if we need to migrate SavedChart table
    if 'saved_charts' in existing_tables:
        existing_columns = [col['name'] for col in inspector.get_columns('saved_charts')]
        
        # Add project_id column if it doesn't exist
        if 'project_id' not in existing_columns:
            print("Adding project_id column to saved_charts table...")
            with engine.connect() as conn:
                # Add column without foreign key constraint first
                conn.execute(text("ALTER TABLE saved_charts ADD COLUMN project_id INTEGER"))
                conn.commit()
            print("Migration completed successfully")
    
    # Check if we need to migrate transformation_projects table
    if 'transformation_projects' in existing_tables:
        existing_columns = [col['name'] for col in inspector.get_columns('transformation_projects')]
        
        # Add pipeline columns if they don't exist
        new_columns = [
            ('pipeline_status', 'TEXT DEFAULT "draft"'),
            ('last_pipeline_run', 'DATETIME'),
            ('schedule_config', 'TEXT'),
            ('warehouse_table_name', 'TEXT'),
            ('canvas_layout', 'TEXT')
        ]
        
        # Check if mode column exists and needs to be removed
        # Note: SQLite doesn't support DROP COLUMN, but we can ignore the column
        if 'mode' in existing_columns:
            print("Note: mode column exists but will be ignored (SQLite doesn't support DROP COLUMN)")
        
        with engine.connect() as conn:
            for column_name, column_def in new_columns:
                if column_name not in existing_columns:
                    print(f"Adding {column_name} column to transformation_projects table...")
                    conn.execute(text(f"ALTER TABLE transformation_projects ADD COLUMN {column_name} {column_def}"))
                    conn.commit()
        
        # Check if we need to update column constraints for project charts
        print("Checking if ai_transformation_steps table needs output_table_name column...")
        with engine.connect() as conn:
            # Check if output_table_name column exists in ai_transformation_steps
            if 'ai_transformation_steps' in existing_tables:
                ai_steps_columns = [col['name'] for col in inspector.get_columns('ai_transformation_steps')]
                if 'output_table_name' not in ai_steps_columns:
                    print("Adding output_table_name column to ai_transformation_steps table...")
                    conn.execute(text("ALTER TABLE ai_transformation_steps ADD COLUMN output_table_name TEXT"))
                    conn.commit()
                    print("Migration completed successfully")

        print("Checking if saved_charts table needs constraint updates...")
        with engine.connect() as conn:
            # Check if we need to migrate the table to allow nullable sheet_id
            # We'll check if there are any project charts that would fail
            try:
                result = conn.execute(text("SELECT COUNT(*) FROM saved_charts WHERE sheet_id IS NULL"))
                null_sheet_count = result.fetchone()[0]
                
                if null_sheet_count == 0:
                    # Test if we can insert a null sheet_id
                    try:
                        test_insert = text("""
                            INSERT INTO saved_charts (user_id, sheet_id, project_id, chart_name, chart_type, x_axis_column, y_axis_column, chart_config, created_at, updated_at)
                            VALUES (1, NULL, 999, 'test', 'bar', 'test_col', NULL, '{}', datetime('now'), datetime('now'))
                        """)
                        conn.execute(test_insert)
                        # If successful, remove the test record
                        conn.execute(text("DELETE FROM saved_charts WHERE project_id = 999 AND chart_name = 'test'"))
                        conn.commit()
                        print("Table already supports nullable sheet_id")
                    except Exception as e:
                        if "NOT NULL constraint failed: saved_charts.sheet_id" in str(e):
                            print("Need to migrate saved_charts table to support nullable sheet_id...")
                            # Recreate table with proper constraints
                            conn.execute(text("ALTER TABLE saved_charts RENAME TO saved_charts_old"))
                            conn.execute(text("""
                                CREATE TABLE saved_charts (
                                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                                    user_id INTEGER NOT NULL,
                                    sheet_id INTEGER,
                                    project_id INTEGER,
                                    chart_name TEXT NOT NULL,
                                    chart_type TEXT NOT NULL,
                                    x_axis_column TEXT,
                                    y_axis_column TEXT,
                                    chart_config TEXT,
                                    created_at DATETIME,
                                    updated_at DATETIME,
                                    FOREIGN KEY (user_id) REFERENCES users(id),
                                    FOREIGN KEY (sheet_id) REFERENCES connected_sheets(id)
                                )
                            """))
                            conn.execute(text("""
                                INSERT INTO saved_charts (user_id, sheet_id, project_id, chart_name, chart_type, x_axis_column, y_axis_column, chart_config, created_at, updated_at)
                                SELECT 1, sheet_id, project_id, chart_name, chart_type, x_axis_column, y_axis_column, chart_config, created_at, updated_at FROM saved_charts_old
                            """))
                            conn.execute(text("DROP TABLE saved_charts_old"))
                            conn.commit()
                            print("Table migration completed successfully")
                        else:
                            raise
            except Exception as e:
                print(f"Migration check failed: {e}")
                # If anything goes wrong, continue without migration
                pass
    
    # Handle users table migration
    if 'users' in existing_tables:
        existing_columns = [col['name'] for col in inspector.get_columns('users')]

        # Check if we need to update users table structure
        if 'google_id' not in existing_columns and 'google_sub' in existing_columns:
            print("Migrating users table: renaming google_sub to google_id...")
            with engine.connect() as conn:
                # Rename google_sub to google_id
                conn.execute(text("ALTER TABLE users RENAME COLUMN google_sub TO google_id"))
                conn.commit()
            print("Users table migration completed")

        # Add missing columns to users table
        missing_columns = []
        required_columns = {
            'onboarding_completed': 'BOOLEAN DEFAULT 0',
            'onboarding_step': 'INTEGER DEFAULT 0',
            'onboarding_data': 'TEXT',
            'profile_picture': 'TEXT'
        }

        for col_name, col_def in required_columns.items():
            if col_name not in existing_columns:
                missing_columns.append((col_name, col_def))

        if missing_columns:
            print(f"Adding missing columns to users table: {[col[0] for col in missing_columns]}")
            with engine.connect() as conn:
                for col_name, col_def in missing_columns:
                    conn.execute(text(f"ALTER TABLE users ADD COLUMN {col_name} {col_def}"))
                conn.commit()
            print("Users table columns added successfully")

    # Create any new tables
    Base.metadata.create_all(bind=engine)

# Create tables with migration
def create_tables():
    migrate_database()

# Dependency to get database session
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# Database operations
class SheetRepository:
    def __init__(self, db: Session):
        self.db = db
    
    def create_or_update_sheet(self, user_id: int, spreadsheet_id: str, spreadsheet_url: str,
                              sheet_name: str, title: str, columns: List[str],
                              sample_data: List[List[str]], total_rows: int) -> ConnectedSheet:
        # Check if sheet already exists for this user
        existing_sheet = self.db.query(ConnectedSheet).filter(
            ConnectedSheet.spreadsheet_id == spreadsheet_id,
            ConnectedSheet.user_id == user_id
        ).first()

        if existing_sheet:
            # Update existing sheet
            existing_sheet.sheet_name = sheet_name
            existing_sheet.title = title
            existing_sheet.columns = columns
            existing_sheet.sample_data = sample_data
            existing_sheet.total_rows = total_rows
            existing_sheet.last_synced = datetime.now(timezone.utc)
            self.db.commit()
            self.db.refresh(existing_sheet)
            return existing_sheet
        else:
            # Create new sheet
            new_sheet = ConnectedSheet(
                user_id=user_id,
                spreadsheet_id=spreadsheet_id,
                spreadsheet_url=spreadsheet_url,
                sheet_name=sheet_name,
                title=title,
                columns=columns,
                sample_data=sample_data,
                total_rows=total_rows
            )
            self.db.add(new_sheet)
            self.db.commit()
            self.db.refresh(new_sheet)
            return new_sheet
    
    def get_all_sheets(self, user_id: int) -> List[ConnectedSheet]:
        return self.db.query(ConnectedSheet).filter(
            ConnectedSheet.user_id == user_id
        ).order_by(ConnectedSheet.connected_at.desc()).all()

    def get_sheet_by_id(self, sheet_id: int, user_id: int) -> Optional[ConnectedSheet]:
        return self.db.query(ConnectedSheet).filter(
            ConnectedSheet.id == sheet_id,
            ConnectedSheet.user_id == user_id
        ).first()

    def get_sheet_by_spreadsheet_id(self, spreadsheet_id: str, user_id: int) -> Optional[ConnectedSheet]:
        return self.db.query(ConnectedSheet).filter(
            ConnectedSheet.spreadsheet_id == spreadsheet_id,
            ConnectedSheet.user_id == user_id
        ).first()

    def delete_sheet(self, sheet_id: int, user_id: int) -> bool:
        sheet = self.get_sheet_by_id(sheet_id, user_id)
        if sheet:
            self.db.delete(sheet)
            self.db.commit()
            return True
        return False

class ChartRepository:
    def __init__(self, db: Session):
        self.db = db
    
    def create_chart(self, user_id: int, sheet_id: int, chart_name: str, chart_type: str,
                    x_axis_column: str, y_axis_column: str, chart_config: Dict[str, Any],
                    project_id: Optional[int] = None) -> SavedChart:
        new_chart = SavedChart(
            user_id=user_id,
            sheet_id=sheet_id,
            project_id=project_id,
            chart_name=chart_name,
            chart_type=chart_type,
            x_axis_column=x_axis_column,
            y_axis_column=y_axis_column,
            chart_config=chart_config
        )
        self.db.add(new_chart)
        self.db.commit()
        self.db.refresh(new_chart)
        return new_chart
    
    def get_charts_by_sheet(self, user_id: int, sheet_id: int) -> List[SavedChart]:
        return self.db.query(SavedChart).filter(
            SavedChart.user_id == user_id,
            SavedChart.sheet_id == sheet_id
        ).order_by(SavedChart.created_at.desc()).all()
    
    def get_chart_by_id(self, user_id: int, chart_id: int) -> Optional[SavedChart]:
        return self.db.query(SavedChart).filter(
            SavedChart.user_id == user_id,
            SavedChart.id == chart_id
        ).first()
    
    def get_all_charts(self, user_id: int) -> List[SavedChart]:
        return self.db.query(SavedChart).filter(
            SavedChart.user_id == user_id
        ).order_by(SavedChart.created_at.desc()).all()
    
    def update_chart(self, user_id: int, chart_id: int, chart_name: str = None, chart_type: str = None,
                    x_axis_column: str = None, y_axis_column: str = None,
                    chart_config: Dict[str, Any] = None) -> Optional[SavedChart]:
        chart = self.get_chart_by_id(user_id, chart_id)
        if chart:
            if chart_name is not None:
                chart.chart_name = chart_name
            if chart_type is not None:
                chart.chart_type = chart_type
            if x_axis_column is not None:
                chart.x_axis_column = x_axis_column
            if y_axis_column is not None:
                chart.y_axis_column = y_axis_column
            if chart_config is not None:
                chart.chart_config = chart_config
            
            chart.updated_at = func.now()
            self.db.commit()
            self.db.refresh(chart)
            return chart
        return None
    
    def delete_chart(self, user_id: int, chart_id: int) -> bool:
        chart = self.get_chart_by_id(user_id, chart_id)
        if chart:
            self.db.delete(chart)
            self.db.commit()
            return True
        return False

class TransformationProjectRepository:
    def __init__(self, db: Session):
        self.db = db
    
    def create_project(self, user_id: int, name: str, description: str, sheet_ids: List[int]) -> TransformationProject:
        project = TransformationProject(
            user_id=user_id,
            name=name,
            description=description,
            sheet_ids=sheet_ids,
            join_config={},
            transformations=[]
        )
        self.db.add(project)
        self.db.commit()
        self.db.refresh(project)
        return project
    
    def get_all_projects(self, user_id: int) -> List[TransformationProject]:
        return self.db.query(TransformationProject).filter(
            TransformationProject.user_id == user_id
        ).order_by(TransformationProject.created_at.desc()).all()
    
    def get_project_by_id(self, user_id: int, project_id: int) -> Optional[TransformationProject]:
        return self.db.query(TransformationProject).filter(
            TransformationProject.user_id == user_id,
            TransformationProject.id == project_id
        ).first()
    
    def update_project(self, user_id: int, project_id: int, **kwargs) -> Optional[TransformationProject]:
        project = self.get_project_by_id(user_id, project_id)
        if project:
            for key, value in kwargs.items():
                if hasattr(project, key) and value is not None:
                    setattr(project, key, value)
            project.updated_at = datetime.now(timezone.utc)
            self.db.commit()
            self.db.refresh(project)
            return project
        return None
    
    def delete_project(self, user_id: int, project_id: int) -> bool:
        project = self.get_project_by_id(user_id, project_id)
        if project:
            self.db.delete(project)
            self.db.commit()
            return True
        return False

class JoinRepository:
    def __init__(self, db: Session):
        self.db = db
    
    def create_join(self, project_id: int, name: str, left_table_id: int, right_table_id: int,
                   left_table_type: str, right_table_type: str, join_type: str, 
                   join_keys: List[Dict[str, str]], canvas_position: Dict[str, int], 
                   output_table_name: Optional[str] = None) -> JoinOperation:
        # Generate table name if not provided
        if not output_table_name or not output_table_name.strip():
            output_table_name = f"join_{project_id}_{int(datetime.now().timestamp())}"
        else:
            # Clean up the provided name
            import re
            output_table_name = re.sub(r'[^\w]', '_', output_table_name.lower())
        
        join_op = JoinOperation(
            project_id=project_id,
            name=name,
            left_table_id=left_table_id,
            right_table_id=right_table_id,
            left_table_type=left_table_type,
            right_table_type=right_table_type,
            join_type=join_type,
            join_keys=join_keys,
            canvas_position=canvas_position,
            output_table_name=output_table_name
        )
        self.db.add(join_op)
        self.db.commit()
        self.db.refresh(join_op)
        return join_op
    
    def get_joins_by_project(self, project_id: int) -> List[JoinOperation]:
        return self.db.query(JoinOperation).filter(JoinOperation.project_id == project_id).order_by(JoinOperation.created_at.desc()).all()
    
    def get_join_by_id(self, join_id: int) -> Optional[JoinOperation]:
        return self.db.query(JoinOperation).filter(JoinOperation.id == join_id).first()
    
    def update_join_status(self, join_id: int, status: str, error_message: str = None, 
                          output_columns: List[str] = None, execution_time_ms: int = None) -> Optional[JoinOperation]:
        join_op = self.get_join_by_id(join_id)
        if join_op:
            join_op.status = status
            if error_message:
                join_op.error_message = error_message
            if output_columns:
                join_op.output_columns = output_columns
            if execution_time_ms:
                join_op.execution_time_ms = execution_time_ms
            join_op.updated_at = datetime.now(timezone.utc)
            self.db.commit()
            self.db.refresh(join_op)
            return join_op
        return None
    
    def update_join(self, join_id: int, name: str, output_table_name: Optional[str],
                   left_table_id: int, right_table_id: int, left_table_type: str,
                   right_table_type: str, join_type: str, join_keys: List[Dict[str, str]]) -> Optional[JoinOperation]:
        join_op = self.get_join_by_id(join_id)
        if join_op:
            join_op.name = name
            join_op.output_table_name = output_table_name
            join_op.left_table_id = left_table_id
            join_op.right_table_id = right_table_id
            join_op.left_table_type = left_table_type
            join_op.right_table_type = right_table_type
            join_op.join_type = join_type
            join_op.join_keys = join_keys
            join_op.updated_at = datetime.utcnow()
            
            self.db.commit()
            return join_op
        return None
    
    def delete_join(self, join_id: int) -> bool:
        join_op = self.get_join_by_id(join_id)
        if join_op:
            self.db.delete(join_op)
            self.db.commit()
            return True
        return False